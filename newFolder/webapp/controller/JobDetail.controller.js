sap.ui.define([
    "com/bpcfn/jobscheduler/controller/BaseController",
    "com/bpcfn/jobscheduler/model/formatter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], function (BaseController, formatter, MessageBox, MessageToast, Fragment, Filter, FilterOperator, JSONModel) {
    "use strict";

    return BaseController.extend("com.bpcfn.jobscheduler.controller.JobDetail", {
        formatter: formatter,
        onInit: function () {
            this.busyDialog = new sap.m.BusyDialog();
            this.oModel = this.getOwnerComponent().getModel("custModel");
            this.oRouter = this.getOwnerComponent().getRouter();
            this.oRouter.getRoute("JobDetail").attachPatternMatched(this._onJobDetailsMatched, this);
            this.i18nModel = this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },
        _onJobDetailsMatched: async function (oEvent) {
            var sJobID = oEvent.getParameter("arguments").jobId;
            var sJobRecCount = oEvent.getParameter("arguments").jobRecCount;
            // remember for the manual refresh button
            this._jobId = sJobID;
            this._jobRecCount = sJobRecCount;
            await this.readTaskDetails(sJobID, sJobRecCount, "JobDetailsModel", "/RepTypeVisible");
            this.getView().getModel("JobDetailsModel").setProperty("/menuBtnEnbld", false);
            this.getView().getModel("JobDetailsModel").setProperty("/convertedTime", false);
            this.loadTimeZoneConversion();
        },
        loadTimeZoneConversion: async function () {
            var jobDetMod = this.getView().getModel("JobDetailsModel").getData();
            var schTimeZone = jobDetMod.scheduling_timezone;
            await this.convertTimeZone(schTimeZone, "JobDetailsModel", "/runStart", this.formatter.reverseDateTime(jobDetMod.sdl_startdt, jobDetMod.sdl_starttm));
            if (jobDetMod.endDate)
                await this.convertTimeZone(schTimeZone, "JobDetailsModel", "/runEnd", this.formatter.reverseDateTime(jobDetMod.endDate, jobDetMod.endTime));
            await this.convertTimeZone(schTimeZone, "JobDetailsModel", "/seriesStart", this.formatter.formatDateTimeZone(jobDetMod.start_date_time));
            if (jobDetMod.end_date_time)
                await this.convertTimeZone(schTimeZone, "JobDetailsModel", "/seriesEnd", this.formatter.formatDateTimeZone(jobDetMod.end_date_time));
        },
        onPressTimeZone: function () {
            this.getView().getModel("JobDetailsModel").setProperty("/convertedTime", !this.getView().getModel("JobDetailsModel").getProperty("/convertedTime"));
        },
        onConsDetails: async function (oEvent) {
            const bindingContext = oEvent.getSource().getParent().getBindingContext("JobDetailsModel").getObject();
            try {
                await this.loadErrorLog(bindingContext);
                if (!this._oConsDetailsDialog) {
                    this._oConsDetailsDialog = await Fragment.load({
                        id: this.getView().getId(),
                        name: "com.bpcfn.jobscheduler.fragments.onHoldUnitsDetails",
                        controller: this
                    });
                    this.getView().addDependent(this._oConsDetailsDialog);
                }
                this._oConsDetailsDialog.open();
            } catch (oError) {
                // Error has already been communicated to the user in loadErrorLog
            }
        },
        /**
         * On-hold / error list.
         *
         * /ErrorLog is not exposed on the /bpcfn/ service yet. The CDS view
         * (/BPCFN/BV_XB_SH_SCHD_ERROR_LOG) exists - it just needs an
         * "expose ... as ErrorLog;" line in sd_xb_schd_task_api.
         *
         * SET TO false IF THE ENTITY SET IS NOT EXPOSED YET. The V4 model
         * batches requests, so a 404 here aborts every other request in the
         * same $batch and blanks the whole page - which is why this guard
         * exists rather than letting the call fail.
         *
         * Prerequisite in sd_xb_schd_task_api.srvd.srvdsrv:
         *   expose /BPCFN/BV_XB_SH_SCHD_ERROR_LOG as ErrorLog;
         * then /IWFND/CACHE_CLEANUP and re-download $metadata.
         */
        _bErrorLogAvailable: true,

        loadErrorLog: async function (bindingContext) {
            if (!this._bErrorLogAvailable) {
                const oEmpty = new JSONModel([]);
                this.getView().setModel(oEmpty, "errorLogsModel");
                return;
            }
            this.busyDialog.open();
            try {
                // The row comes from the expanded _Tasks collection. If the
                // $select trimmed the parent keys off the child, fall back to
                // the header, which always has them.
                const oHdr = this.getView().getModel("JobDetailsModel").getData();
                const sGuid = bindingContext.guid || oHdr.guid;
                const sRec  = bindingContext.job_rec_count || oHdr.job_rec_count;
                const sTask = bindingContext.task_id;

                // Leave this in until the dialog is confirmed working - it
                // tells you immediately whether the filter values are right
                // or whether the backend simply has no rows.
                /* eslint-disable no-console */
                console.log("[OnHold] filtering ErrorLog on",
                            { guid: sGuid, job_rec_count: sRec, task_id: sTask });

                const filter = [];
                filter.push(new Filter("Guid", FilterOperator.EQ, sGuid));
                filter.push(new Filter("JobRecCount", FilterOperator.EQ, sRec));
                filter.push(new Filter("TaskId", FilterOperator.EQ, sTask));
                const tableListbinding = this.oModel.bindList("/ErrorLog", undefined, undefined, filter);
                const aContexts = await tableListbinding.requestContexts(0, 99999);
                // Fetch actual data objects
                const aData = await Promise.all(aContexts.map(oContext => oContext.requestObject()));
                const errorLogsModel = new JSONModel();
                errorLogsModel.setData(aData);
                errorLogsModel.setSizeLimit(aData.length);
                console.log("[OnHold] rows returned:", aData.length, aData);
                /* eslint-enable no-console */
                this.getView().setModel(errorLogsModel, "errorLogsModel");
            } catch (oError) {
                MessageBox.error(this.i18nModel.getText("FailedData"));
                throw oError;
            } finally {
                this.busyDialog.close();
            }
        },
        onCloseValueHelp: function (oEvent) {
            oEvent.getSource().getParent().getParent().close();
        },
        buildTaskTree: function (data) {
            const tree = {};
            data.forEach(item => {
                const { guid, seqno, task_id, task_desc, ...childFields } = item;
                const key = `${guid}-${seqno}-${task_id}-${task_desc}`;

                if (!tree[key]) {
                    tree[key] = {
                        guid,
                        seqno,
                        task_id,
                        task_desc,
                        children: []
                    };
                }
                tree[key].children.push(item);
            });
            return Object.values(tree);
        },
        onTaskSelected: function (oEvent) {
            this.getView().getModel("JobDetailsModel").setProperty("/menuBtnEnbld", true);
            this.selTaskRowData = oEvent.getParameter("listItem").getBindingContext("JobDetailsModel").getObject(); //this is for sap.m.table
            // this.selTaskRowData = oEvent.getParameter("rowContext").getObject(); // this is for tree table
        },
        onRestartSelTask: function () {
            this.restartValue = "S";
            this.onRestart();
        },
        onRestartFromTask: function () {
            this.restartValue = "F";
            this.onRestart();
        },
        /**
         * Trigger a restart.
         *
         * WHY AN ACTION AND NOT A PATCH
         * The previous version did setProperty("restart", ...) on the task
         * row. lhc_Tasks~update only merges changed fields into
         * lcl_buffer=>gt_task_update and the saver writes them - it never
         * calls create_variant_n_submit_job. So the PATCH set a column and
         * nothing ran, which is why pressing Restart produced no backend
         * activity and no message.
         *
         * restartSelected / restartFrom DO call
         * create_variant_n_submit_job, which opens a NEW background job,
         * builds the variant and submits it. The scheduler record keeps its
         * original guid + job_rec_count; only the SAP job (jobcount) is new.
         *
         * The two key-field setProperty calls are gone as well: guid,
         * job_rec_count and seqno are keys and already hold these values -
         * writing them queued PATCHes that could only fail.
         */
        onRefreshDetails: async function () {
            // The screen shows a JSONModel (JobDetailsModel) that was COPIED
            // from OData by readTaskDetails - refreshing the OData model alone
            // does not update it (that was why the button appeared to do
            // nothing). So: invalidate the OData cache, then RE-READ into the
            // JSON model, which also overwrites any transient 'RS' with the
            // real status from the table.
            if (!this._jobId) { return; }
            this.busyDialog.open();
            try {
                this.oModel.refresh();   // drop cached OData so the re-read is fresh
                await this.readTaskDetails(this._jobId, this._jobRecCount,
                                           "JobDetailsModel", "/RepTypeVisible");
                this.getView().getModel("JobDetailsModel").setProperty("/menuBtnEnbld", false);
                this.getView().getModel("JobDetailsModel").setProperty("/convertedTime", false);
                await this.loadTimeZoneConversion();
            } finally {
                this.busyDialog.close();
            }
        },

        /**
         * Set t_status = 'RS' (Restarted) on the affected task rows in the
         * local JobDetailsModel for immediate feedback. Restart Selected ->
         * only the selected task; Restart From -> that task and every task
         * after it (by seqno), since all of those re-run.
         */
        _markTasksRestarted: function () {
            var oModel = this.getView().getModel("JobDetailsModel");
            var aTasks = oModel.getProperty("/_Tasks") || [];
            var iFromSeq = Number(this.selTaskRowData.seqno);
            var bFrom = (this.restartValue === "F");
            aTasks.forEach(function (t) {
                var apply = bFrom ? (Number(t.seqno) >= iFromSeq)
                                  : (Number(t.seqno) === iFromSeq);
                if (apply) { t.t_status = "RS"; }
            });
            oModel.setProperty("/_Tasks", aTasks);
        },

        onRestart: async function () {
            const keyFilter = [];
            keyFilter.push(new sap.ui.model.Filter("guid", sap.ui.model.FilterOperator.EQ, this.selTaskRowData.guid));
            keyFilter.push(new sap.ui.model.Filter("task_id", sap.ui.model.FilterOperator.EQ, this.selTaskRowData.task_id));
            keyFilter.push(new sap.ui.model.Filter("seqno", sap.ui.model.FilterOperator.EQ, this.selTaskRowData.seqno));
            keyFilter.push(new sap.ui.model.Filter("job_rec_count", sap.ui.model.FilterOperator.EQ, this.selTaskRowData.job_rec_count));

            this.busyDialog.open();
            try {
                const gpItemListBinding = this.oModel.bindList("/SchedulerTaskItem", undefined, undefined, keyFilter);
                const aContexts = await gpItemListBinding.requestContexts();
                if (!aContexts || aContexts.length === 0) {
                    MessageBox.error(this.i18nModel.getText("FailedRestart"));
                    return;
                }

                // Derive the schema namespace instead of hardcoding it - the
                // service path has already changed once on this project
                // (srvd_a2x -> srvd), and a re-version would break a literal.
                // "<namespace>.Container" -> strip the last segment.
                const oMeta = this.oModel.getMetaModel();
                const sContainer = await oMeta.requestObject("/$EntityContainer");
                const sNamespace = sContainer.substring(0, sContainer.lastIndexOf("."));

                const sActionName = (this.restartValue === "F") ? "restartFrom" : "restartSelected";
                const oOperation = this.oModel.bindContext(
                    sNamespace + "." + sActionName + "(...)", aContexts[0]);

                await oOperation.execute();

                // FRONTEND-TRANSIENT feedback: mark the restarted task(s) as
                // "Restarted" (RS) in the local model straight away, so the
                // user sees the change immediately - before the OData refresh
                // round-trips. The engine writes the authoritative RS too, so
                // the refresh below just confirms it.
                this._markTasksRestarted();

                // pick up the new jobcount and authoritative statuses
                await this.oModel.refresh();
                MessageToast.show(this.i18nModel.getText("RestartTriggered"));

            } catch (oError) {
                MessageBox.error(this.i18nModel.getText("FailedRestart"));
            } finally {
                this.busyDialog.close();
            }
        }
    });
});