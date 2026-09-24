sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/bpcfn/jobscheduler/model/formatter",
    "com/bpcfn/jobscheduler/util/ClientTimeZone",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, formatter, ClientTimeZone, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("com.bpcfn.jobscheduler.controller.BaseController", {
        // Common methods go here
        formatter: formatter,
        getRouter: function () {
            return this.getOwnerComponent().getRouter();
        },
        /**
         * Navigate to the standard Task Logs app.
         *
         * Target (confirmed from the running FLP URL):
         *   #ConsolidationLog-log?ApplicationJob=<jobcount>
         *                        &ReferenceApplicationJobName=<jobname>
         *
         * WHY THE OLD VERSION LANDED BACK ON THIS PAGE:
         * it built the URL by hand as
         *     window.location.href.split("#")[0] + href
         * hrefForExternal() returns a bare hash ("#ConsolidationLog-log?..."),
         * so that concatenation produced
         *     <this app's own URL>#ConsolidationLog-log?...
         * i.e. a new hash on the CURRENT page. This app's own router then
         * handled it, matched nothing useful, and stayed put. The shell was
         * never involved.
         *
         * toExternal() hands the intent to the FLP, which resolves it to the
         * target app. Note this only navigates inside a real launchpad - in
         * the local/BAS sandbox preview the target tile is not registered, so
         * expect it to work only once deployed.
         */
        onNavToTaskLogs: function (oEvent) {
            var oSource = oEvent.getSource();

            // The button appears both in the header (bound to the model root)
            // and inside a task row. Walk up until a context turns up, then
            // fall back to the model root.
            var oCtx = oSource.getBindingContext("JobDetailsModel");
            var oParent = oSource.getParent();
            while (!oCtx && oParent) {
                oCtx = oParent.getBindingContext("JobDetailsModel");
                oParent = oParent.getParent();
            }
            var selRow = oCtx ? oCtx.getObject()
                              : this.getView().getModel("JobDetailsModel").getData();

            if (!selRow) {
                sap.m.MessageToast.show(
                    this.i18nModel ? this.i18nModel.getText("NoJobLogRef")
                                   : "No log reference available for this row.");
                return;
            }

            var oCrossNav = sap.ushell && sap.ushell.Container &&
                sap.ushell.Container.getService &&
                sap.ushell.Container.getService("CrossApplicationNavigation");
            if (!oCrossNav) {
                sap.m.MessageToast.show(
                    this.i18nModel ? this.i18nModel.getText("NoShellNav")
                                   : "Task Logs can only be opened from the Fiori launchpad.");
                return;
            }

            var oHdr = this.getView().getModel("JobDetailsModel").getData();
            var val = function (k) { return selRow[k] || oHdr[k]; };

            // job's creation date (YYYY-MM-DD) - used to widen the app's
            // default date window so it cannot clamp out an older log.
            var pad0 = function (n) { return String(n).padStart(2, "0"); };
            var sRawD = String(val("creation_date") || "").trim();
            var sCreated;
            if (/^\d{4}-\d{2}-\d{2}/.test(sRawD)) { sCreated = sRawD.substring(0, 10); }
            else if (/^\d{8}$/.test(sRawD)) {
                sCreated = sRawD.substring(0, 4) + "-" + sRawD.substring(4, 6) + "-" + sRawD.substring(6, 8);
            } else {
                var dNow = new Date();
                sCreated = dNow.getFullYear() + "-" + pad0(dNow.getMonth() + 1) + "-" + pad0(dNow.getDate());
            }

            // Only task categories 03 / 06 / 70 carry a log_time_id (the engine
            // stores it just for those). Any task WITH an id -> open the exact
            // log by id. Every OTHER task -> open by JOB NAME (the original
            // plan), using the standard job-reference params.
            var oParams;
            var sLogId = val("log_time_id") || val("LogTimeID");
            if (sLogId) {
                // Exact log by id. Creation date widens the app's ~7-day
                // default window so an older log is not clamped out.
                oParams = { "LogTimeID": sLogId, "createdDateTime": sCreated };
            } else {
                // JOB-NAME path for all non-03/06/70 tasks. Needs the
                // background job reference on the row.
                if (!val("jobcount") || !val("jobname")) {
                    sap.m.MessageToast.show(
                        this.i18nModel ? this.i18nModel.getText("NoJobLogRef")
                                       : "No job reference available for this task.");
                    return;
                }
                oParams = {
                    "ApplicationJob": val("jobcount"),
                    "ReferenceApplicationJobName": val("jobname")
                };
            }

            oCrossNav.toExternal({
                target: { semanticObject: "ConsolidationLog", action: "log" },
                params: oParams
            });
        },
        readTaskDetails: async function (sJobID, sJobRecCount, model, reptype) {
            this.oModel = this.getOwnerComponent().getModel("custModel");
            this.busyDialog.open();
            // guid is Edm.Guid. In OData V4 a Guid literal is written BARE -
            // quoting it makes it a String literal and the server rejects the
            // comparison with "Invalid parameter type used with function 'eq'".
            // job_rec_count is Edm.String, so that one does need quotes.
            //
            // Nav properties are "_Tasks" / "_ConUnits" (case-sensitive); the
            // lowercase "_tasks,_con_units" came from the /shl/ service.
            const oListBinding = this.oModel.bindList("/SchedulerTask", undefined, undefined, undefined, {
                $filter: "guid eq " + sJobID + " and job_rec_count eq '" + sJobRecCount + "'",
                $expand: "_Tasks,_ConUnits"
            });
            const aContexts = await oListBinding.requestContexts();
            this.busyDialog.close();
            let aData = aContexts.map(ctx => ctx.getObject());
            const jsonModel = new JSONModel(aData[0]);
            jsonModel.setSizeLimit(99999);
            const sortData = (aData[0]._Tasks || []).sort((a, b) => a.seqno - b.seqno);
            aData[0]._Tasks = sortData;
            this.getView().setModel(jsonModel, model)
            var aTokens = [];
            var consData = aData[0]._ConUnits || [];
            jsonModel.setProperty(reptype, false);
            jsonModel.setProperty("/endDate", jsonModel.getData().enddate);
            jsonModel.setProperty("/endTime", jsonModel.getData().endtime);
            jsonModel.setProperty("/ConsUnitEditable", jsonModel.getProperty("/task_type") === "DM" ? true : false);
            (aData[0]._Tasks || []).forEach(function (item) {
                if (jsonModel.getProperty("/block_unblock") === "") {
                    if (item.task_id === "1015") {
                        jsonModel.setProperty(reptype, true);
                        let selIndex = 0;
                        if (item.complete_flag === "X")
                            selIndex = 1;
                        else if (item.delta_flag === "X")
                            selIndex = 2;
                        this.getView().getModel(model).setProperty("/RepType", selIndex);
                    }
                }
            }.bind(this));
            consData.forEach(function (item) {
                aTokens.push({ key: item.con_unit, text: item.con_unit });
            });
            jsonModel.setProperty("/ConsUnitTokens", aTokens);

            // --- which tasks have on-hold / error rows? -------------------
            // The On Hold button used to be enabled on o_status === 'H'.
            // That asks "was this task held?", but the dialog now shows
            // "which units will be reprocessed here" - two different
            // questions. The first task to fail never gets o_status 'H'
            // (check_status sets the mv_status latch instead), so its own
            // error rows were unreachable.
            //
            // One extra read gives the definitive answer per task, and it
            // does not depend on t_status, which is still parked.
            try {
                const oLogBinding = this.oModel.bindList("/ErrorLog", undefined, undefined, [
                    new Filter("Guid", FilterOperator.EQ, aData[0].guid),
                    new Filter("JobRecCount", FilterOperator.EQ, aData[0].job_rec_count)
                ]);
                const aLogCtx = await oLogBinding.requestContexts(0, 99999);
                const oTaskSet = {};
                aLogCtx.forEach(function (oCtx) {
                    oTaskSet[oCtx.getObject().TaskId] = true;
                });
                (aData[0]._Tasks || []).forEach(function (item) {
                    item.hasHoldUnits = !!oTaskSet[item.task_id];
                });
            } catch (oErr) {
                // ErrorLog not exposed, or the read failed - fall back to
                // enabling nothing rather than blocking the whole page.
                (aData[0]._Tasks || []).forEach(function (item) {
                    item.hasHoldUnits = false;
                });
            }
            jsonModel.refresh(true);

            return aData[0]._Tasks;
        },
        convertTimeZone: function (schTimeZone, modelName, property, selTime) {
            var parts = selTime.split(", ");
            var dateParts = parts[0].split(".");
            var timeParts = parts[1].split(":");

            // Construct ISO string
            this.isoDate = dateParts[2] + "-" + dateParts[1] + "-" + dateParts[0] + "T" +
                timeParts[0] + ":" + timeParts[1] + ":" + timeParts[2];
            this.busyDialog.open();
            return new Promise(function (resolve, reject) {
                this.getOwnerComponent().getModel("standardModel").read("/GetTimeZoneForDate", {
                    urlParameters: {
                        TzCode: "'" + schTimeZone + "'",
                        DateTime: "datetime'" + this.isoDate + "'"
                    },
                    success: function (oData) {
                        this.busyDialog.close();
                        const out = this.formatter.addTimeToIso(this.isoDate, { ms: oData.UtcCalcDifference.ms }, oData.UtcSign, true);
                        const covertedTime = this.formatter.formatDateTimeZone(out);
                        this.getView().getModel(modelName).setProperty(property, covertedTime);
                        resolve();
                    }.bind(this),
                    error: function (error) {
                        this.busyDialog.close();
                        reject();
                    }.bind(this)
                });
            }.bind(this));
        },
        readUsersTimezoneFromBackend: function () {
            return new Promise(function (resolve, reject) {
                var date = new Date();
                var supported = ClientTimeZone.isDSTSupported(date);
                var daylight = ClientTimeZone.dst(date);
                var utcTimeOffset = -date.getTimezoneOffset();
                var utcTimeOffsetSign;
                if (utcTimeOffset >= 0) {
                    utcTimeOffsetSign = "+";
                } else {
                    utcTimeOffsetSign = "-";
                    utcTimeOffset = utcTimeOffset * -1;
                }
                var dateInstance = sap.ui.core.format.DateFormat.getTimeInstance({
                    pattern: "PTHH'H'mm'M'ss'S'",
                    UTC: true
                });
                var newDate = new Date(Date.UTC(2020, 10, 10, 0, 0, 0));
                newDate.setMinutes(newDate.getMinutes() + utcTimeOffset);
                var utcDiff = dateInstance.format(newDate);
                var filters = [new Filter("SupportsDayLightSavingInd", "EQ", supported), new Filter("UtcCalcDifference", "EQ", utcDiff), new Filter("UtcSign", "EQ", utcTimeOffsetSign), new Filter("IsDayLightSavingActiveInd", "EQ", daylight)];
                this.getOwnerComponent().getModel("standardModel").read("/TimeZoneSet", {
                    filters: filters,
                    success: function (j) {
                        resolve(j);
                    },
                    error: function (j) {
                        reject(j);
                    }
                });
            }.bind(this));
        }
    });
});