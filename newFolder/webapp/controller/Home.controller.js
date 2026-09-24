sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "com/bpcfn/jobscheduler/model/formatter",
    "sap/ui/export/library",
    "sap/ui/export/Spreadsheet",
    "sap/m/DynamicDateRange"
], function (Controller, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, formatter, exportLibrary, Spreadsheet, DynamicDateRange) {
    "use strict";
    const EdmType = exportLibrary.EdmType;
    return Controller.extend("com.bpcfn.jobscheduler.controller.Home", {
        formatter: formatter,
        onInit: function () {
            this.busyDialog = new sap.m.BusyDialog();
            this.JobDetailTable = this.byId("idJobDetTable");
            this.custModel = this.getOwnerComponent().getModel("custModel");
            this.oRouter = this.getOwnerComponent().getRouter();
            this.oRouter.getRoute("Home").attachPatternMatched(this._onHomeMatched, this);
            this.filterModel = new JSONModel();
            this.getView().setModel(this.filterModel, "filterModel");
            this.jobModel = new JSONModel();
            this.jobModel.setSizeLimit(99999);
            
            this.getView().setModel(this.jobModel, "jobModel");
            this.i18nModel = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            this.oDateRangeFilter = this.byId("idDateFilter");

            // The status filter is fed from a JSONModel rather than bound
            // straight to /VH_Status.
            //
            // Two reasons: a Select with an items aggregation binding
            // discards static children, so an "All" entry declared in the
            // view disappears; and attaching to dataReceived is unreliable
            // because the binding may already have resolved by the time
            // onInit runs. Building the list explicitly guarantees both the
            // ordering and the presence of the blank entry.
            this._loadStatusFilter();
        },
        /**
         * Build the status filter list: "All" first, then the domain values
         * with their descriptions.
         *
         * Key "" is what makes "All" work - the filter guard reads
         *     if (selStatus) { aFilters.push(...) }
         * so an empty key applies no status restriction at all.
         */
        _loadStatusFilter: async function () {
            const aItems = [{ key: "", text: this.i18nModel.getText("StatusAll") }];
            try {
                const oBinding = this.custModel.bindList("/VH_Status", undefined,
                    [new sap.ui.model.Sorter("Status")]);
                const aCtx = await oBinding.requestContexts(0, 999);
                aCtx.forEach(function (oCtx) {
                    const sCode = oCtx.getObject().Status;
                    if (sCode) {
                        aItems.push({ key: sCode, text: formatter.statusText(sCode) });
                    }
                });
            } catch (oErr) {
                // VH_Status unreadable - leave "All" so the filter still works
            }
            this.getView().setModel(new JSONModel({ items: aItems }), "statusFilterModel");
        },

        _onHomeMatched: async function () {
            this.initializeData(); 
            this._checkAuth(false);

            // KPI drill-down: the dashboard stashed a status (and scope) on
            // the Component before navigating here. Apply it as the status
            // filter so the list lands showing exactly that tile's jobs, then
            // clear it so a normal navigation is not stuck with the filter.
            const oComp = this.getOwnerComponent();
            if (oComp._kpiStatusFilter !== undefined && oComp._kpiStatusFilter !== null) {
                // KPI drill now feeds the multi-select: set StatusKeys to the
                // one clicked status (or clear for "All"/empty).
                this.getView().getModel("filterModel").setProperty("/StatusKeys",
                    oComp._kpiStatusFilter ? [oComp._kpiStatusFilter] : []);
                if (oComp._kpiScope) {
                    const oFM = this.getView().getModel("filterModel");
                    if (oComp._kpiScope.version) { oFM.setProperty("/Version", oComp._kpiScope.version); }
                    if (oComp._kpiScope.year)    { oFM.setProperty("/FcYear",  oComp._kpiScope.year); }
                    if (oComp._kpiScope.period)  { oFM.setProperty("/FcPeriod", oComp._kpiScope.period); }
                }
                oComp._kpiStatusFilter = undefined;
                oComp._kpiScope = undefined;
            }

            // Discard the V4 model's cached responses before reloading.
            // onRefreshData() creates a fresh bindList, but the model caches
            // per path+parameters, so returning from the wizard would show
            // the pre-create list and the new job would appear missing.
            if (this.custModel && typeof this.custModel.refresh === "function") {
                this.custModel.refresh();
            }

            await this.onRefreshData();
        },
        initializeData: function () {
            this.JobDetailTable.clearSelection();
            // Default window: 30 days back, 10 days FORWARD.
            // The forward half matters for recurring jobs - future
            // occurrences carry status 'S' and were previously filtered out
            // entirely, which is why scheduled runs never appeared.
            const stDtMs  = new Date().getTime() - 30 * 24 * 60 * 60 * 1000;
            const endDtMs = new Date().getTime() + 10 * 24 * 60 * 60 * 1000;
            const stDate  = new Date(stDtMs);
            const endDate = new Date(endDtMs);
            this.selDate = {};
            this.selDate.oValue1 = stDate;
            this.selDate.oValue2 = endDate;
            this.oDateRangeFilter.setValue({
                operator: "DATERANGE",
                values: [stDate, endDate]
            });
            this.getView().getModel("jobModel").setData({
                "CheckAuth": false,
                "CreateEnabled": false,
                "CopyEnabled": false,
                "CancelEnabled": false,
                "ManualActivityEnabled": false
            }, true);
            this.getView().getModel("filterModel").setData({
                "JobName": "",
                "JobNameText": "",
                "CreatedBy": "",
                "Status": "",
                "StatusKeys": [],
                "Version": "",
                "FcYear": "",
                "FcPeriod": ""
            }, true);
        },
        onChangeDateRange: function (oEvent) {
            let bValid = oEvent.getParameter("valid");
            if (bValid) {
                this.selDate = this._createDateFilter(oEvent.getParameter("value"));
                this.oDateRangeFilter.setValueState("None");
            } else {
                this.oDateRangeFilter.setValueState("Error");
            }
        },
        _createDateFilter: function (oValue) {
            if (oValue) {
                var aDates = DynamicDateRange.toDates(oValue);
                if (oValue.operator === "FROM" || oValue.operator === "FROMDATETIME") {
                    return { sOperator: FilterOperator.GT, oValue1: aDates[0], oValue2: null };
                } else if (oValue.operator === "TO" || oValue.operator === "TODATETIME") {
                    return { sOperator: FilterOperator.LT, oValue1: aDates[0], oValue2: null };
                }
                return { sOperator: FilterOperator.BT, oValue1: aDates[0], oValue2: aDates[1] };
            } else {
                // Reset the currently applied filters
                return { sOperator: null, oValue1: null, oValue2: null };
            }
        },
        onCanSelJob: function () { this.onCancelJob("SJ"); },
        onCanEntJob: function () { this.onCancelJob("EJ"); },

        /**
         * Cancel a scheduled job.
         *
         * WHY AN ACTION AND NOT A PATCH
         * The previous version did setProperty("cancel_job", ...). Nothing
         * on the backend reads that column - grep found only the
         * declaration and implementation of cancel_job( ), no caller - so
         * the value was written to the database and no job was ever
         * cancelled. It also wrote job_rec_count, a key field that already
         * held that value, queueing a PATCH that could only fail.
         *
         * cancelJob is a bound action on SchdTask that calls
         * /BPCFN/CL_XB_FINCS_SCHD_TASK=>cancel_job( ), which deletes the
         * SM37 jobs via BP_JOB_DELETE.
         *
         *   SJ = this occurrence only
         *   EJ = every remaining occurrence of the series
         */
        onCancelJob: async function (sMode) {
            if (sMode !== "SJ" && sMode !== "EJ") {
                MessageBox.error(this.i18nModel.getText("FailedCancel"));
                return;
            }
            if (!this.selJobRowData) {
                return;
            }

            const oBundle = this.i18nModel;
            const sPrompt = (sMode === "EJ")
                ? oBundle.getText("ConfirmCancelSeries")
                : oBundle.getText("ConfirmCancelOccurrence");

            MessageBox.confirm(sPrompt, {
                onClose: async function (sAction) {
                    if (sAction !== MessageBox.Action.OK) {
                        return;
                    }
                    this.busyDialog.open();
                    try {
                        const keyFilter = [
                            new Filter("guid", FilterOperator.EQ, this.selJobRowData.guid),
                            new Filter("job_rec_count", FilterOperator.EQ, this.selJobRowData.job_rec_count)
                        ];
                        const oBinding = this.custModel.bindList("/SchedulerTask", undefined, undefined, keyFilter);
                        const aContexts = await oBinding.requestContexts();
                        if (!aContexts || aContexts.length === 0) {
                            MessageBox.error(oBundle.getText("FailedCancel"));
                            return;
                        }

                        // Derive the schema namespace rather than hardcoding
                        // it - this service's path has already changed once
                        // on this project (srvd_a2x -> srvd).
                        const oMeta = this.custModel.getMetaModel();
                        const sContainer = await oMeta.requestObject("/$EntityContainer");
                        const sNamespace = sContainer.substring(0, sContainer.lastIndexOf("."));

                        const oOperation = this.custModel.bindContext(
                            sNamespace + ".cancelJob(...)", aContexts[0]);
                        oOperation.setParameter("cancel_mode", sMode);
                        await oOperation.execute();

                        // Report success as soon as the action returns.
                        // The refresh calls below are cosmetic - if one of
                        // them throws, the cancellation has ALREADY happened
                        // and telling the user it failed is simply wrong.
                        // That is what produced "failed to cancel" on a job
                        // that was in fact cancelled: initializeData() resets
                        // the date filter and re-reads, and any hiccup there
                        // landed in this catch.
                        MessageToast.show(oBundle.getText("CancelSubmitted"));

                        try {
                            await this.custModel.refresh();
                            this.initializeData();
                            await this.onRefreshData();
                        } catch (oRefreshErr) {
                            // list may be stale; the cancel itself succeeded
                        }

                    } catch (oError) {
                        // Surface what the backend actually said. "Failed to
                        // cancel the job" on its own hides whether this was
                        // a RAP validation message, a wrong action name, or
                        // a parameter mismatch - three very different fixes.
                        /* eslint-disable no-console */
                        console.error("[CancelJob] action failed", oError);
                        /* eslint-enable no-console */

                        let sDetail = oError && oError.message ? oError.message : "";
                        // RAP messages arrive in the error body rather than
                        // the top-level message
                        if (oError && oError.error && oError.error.message) {
                            sDetail = oError.error.message;
                        }
                        MessageBox.error(oBundle.getText("FailedCancel"), {
                            details: sDetail || undefined
                        });
                    } finally {
                        this.busyDialog.close();
                    }
                }.bind(this)
            });
        },

        formatDateToYYYYMMDD: function (oDate) {
            if (!oDate) return "";
            const year = oDate.getFullYear();
            const month = String(oDate.getMonth() + 1).padStart(2, "0");
            const day = String(oDate.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        },
        formatDateToHHMMSS: function (oDate) {
            if (!oDate) return "";
            const hour = String(oDate.getHours()).padStart(2, "0");
            const min = String(oDate.getMinutes()).padStart(2, "0");
            const sec = String(oDate.getSeconds()).padStart(2, "0");
            return `${hour}:${min}:${sec}`;
        },
        onClear: async function () {
            await this.initializeData();
            this.onRefreshData();
        },
        createFilters: function () {
            try {
                const filterModelData = this.getView().getModel("filterModel").getData();
                const aFilters = [];

                if (this.selDate && this.selDate.sOperator === "LT") {
                    this.selDate.oValue2 = new Date(this.selDate.oValue1.getTime() + 24 * 60 * 60 * 1000 - 1000);
                    this.selDate.oValue1 = new Date(this.selDate.oValue1.getTime() - 29 * 24 * 60 * 60 * 1000);
                }

                if (this.selDate && this.selDate.sOperator === "GT") {
                    this.selDate.oValue2 = new Date(this.selDate.oValue1.getTime() + 30 * 24 * 60 * 60 * 1000);
                }

                var selJob = (filterModelData.JobNameText ?? "").trim();
                var oStartDate = this.selDate && this.selDate.oValue1 ? new Date(this.selDate.oValue1) : undefined;
                var oEndDate = this.selDate && this.selDate.oValue2 ? new Date(this.selDate.oValue2) : undefined;
                var creator = filterModelData.CreatedBy === undefined ? "" : filterModelData.CreatedBy;
                var aStatusKeys = filterModelData.StatusKeys || [];
                // ignore the "All" pseudo-entry (empty key) if present
                aStatusKeys = aStatusKeys.filter(function (k) { return k !== "" && k !== undefined; });
                var selVersion = filterModelData.Version === undefined ? "" : filterModelData.Version;
                var selFcYear  = filterModelData.FcYear === undefined ? "" : String(filterModelData.FcYear).trim();
                var selFcPeriod = filterModelData.FcPeriod === undefined ? "" : String(filterModelData.FcPeriod).trim();

                // Job Name filter
                if (selJob) {
                    aFilters.push(new Filter("jobname", FilterOperator.Contains, selJob));
                }
                // Created By Filter - match EITHER the generic user id OR the
                // creator, since the list shows generic_user_id ?? createdby.
                // A job run by a normal user has generic_user_id blank, so
                // filtering only on generic_user_id would miss it.
                if (creator) {
                    aFilters.push(new Filter({
                        filters: [
                            new Filter("generic_user_id", FilterOperator.Contains, creator),
                            new Filter("createdby", FilterOperator.Contains, creator)
                        ],
                        and: false
                    }));
                }
                // Status Filter - multiple values OR'd together.
                if (aStatusKeys.length) {
                    aFilters.push(new Filter({
                        filters: aStatusKeys.map(function (k) {
                            return new Filter("status", FilterOperator.EQ, k);
                        }),
                        and: false
                    }));
                }
                // Version filter (used by the KPI drill-down to scope the list
                // to the same version the dashboard was showing).
                if (selVersion) {
                    aFilters.push(new Filter("version", FilterOperator.EQ, selVersion));
                }
                // Fiscal year / period filters (padded to the stored width).
                if (selFcYear) {
                    aFilters.push(new Filter("fc_year", FilterOperator.EQ, selFcYear.padStart(4, "0")));
                }
                if (selFcPeriod) {
                    aFilters.push(new Filter("fc_period", FilterOperator.EQ, selFcPeriod.padStart(3, "0")));
                }

                if (oStartDate && oEndDate) {
                    // 45-day ceiling. The default span is 40 days
                    // (-30 / +10), so a 30-day limit would silently reject
                    // the app's own default range.
                    if (oEndDate.getTime() - oStartDate.getTime() <= (45 * 24 * 60 * 60 * 1000)) {
                        this.busyDialog.open();
                        // Start and End Date Range filter logic for universal time
                        // local start of day
                        let localStart = new Date(`${this.formatDateToYYYYMMDD(oStartDate)}T${this.formatDateToHHMMSS(oStartDate)}`);

                        // local end of day
                        let localEnd = new Date(`${this.formatDateToYYYYMMDD(oEndDate)}T${this.formatDateToHHMMSS(oEndDate)}`);


                        let utcStart = localStart.toISOString();
                        let utcEnd = localEnd.toISOString();


                        let utcStartDate = utcStart.split("T")[0];
                        let utcStartTime = utcStart.split("T")[1].replace("Z", "");

                        let utcEndDate = utcEnd.split("T")[0];
                        let utcEndTime = utcEnd.split("T")[1].replace("Z", "");

                        // A) Middle dates: (date > startDate AND date < endDate)
                        const oMiddleDates = new sap.ui.model.Filter({
                            filters: [
                                new sap.ui.model.Filter("sdl_startdt", sap.ui.model.FilterOperator.GT, utcStartDate),
                                new sap.ui.model.Filter("sdl_startdt", sap.ui.model.FilterOperator.LT, utcEndDate)
                            ],
                            and: true
                        });

                        // B) Start boundary: (date == startDate AND time >= startTime)
                        const oStartBoundary = new sap.ui.model.Filter({
                            filters: [
                                new sap.ui.model.Filter("sdl_startdt", sap.ui.model.FilterOperator.EQ, utcStartDate),
                                new sap.ui.model.Filter("sdl_starttm", sap.ui.model.FilterOperator.GE, utcStartTime)
                            ],
                            and: true
                        });

                        // C) End boundary: (date == endDate AND time <= endTime)
                        //   Use LT for exclusive end; use LE for inclusive end.
                        const oEndBoundary = new sap.ui.model.Filter({
                            filters: [
                                new sap.ui.model.Filter("sdl_startdt", sap.ui.model.FilterOperator.EQ, utcEndDate),
                                new sap.ui.model.Filter("sdl_starttm", sap.ui.model.FilterOperator.LE, utcEndTime)
                            ],
                            and: true
                        });

                        const oBetweenRange = new sap.ui.model.Filter({
                            filters: [oMiddleDates, oStartBoundary, oEndBoundary],
                            and: false // false = OR
                        });

                        aFilters.push(oBetweenRange);
                        return aFilters;
                    } else {
                        MessageBox.error(this.i18nModel.getText("DateRangeErr"));
                        this.JobDetailTable.setShowOverlay(true);
                    }
                } else if (oEndDate && !oStartDate) {
                    let localEnd = new Date(`${this.formatDateToYYYYMMDD(oEndDate)}T${this.formatDateToHHMMSS(oEndDate)}`);
                    let utcEnd = localEnd.toISOString();
                    let utcEndDate = utcEnd.split("T")[0];
                    let utcEndTime = utcEnd.split("T")[1].replace("Z", "");
                    const oEndBoundary = new sap.ui.model.Filter({
                        filters: [
                            new sap.ui.model.Filter("sdl_startdt", sap.ui.model.FilterOperator.EQ, utcEndDate),
                            new sap.ui.model.Filter("sdl_starttm", sap.ui.model.FilterOperator.LE, utcEndTime)
                        ],
                        and: true
                    });
                    aFilters.push(oEndBoundary);
                    return aFilters;
                } else if (oStartDate && !oEndDate) {
                    let localStart = new Date(`${this.formatDateToYYYYMMDD(oStartDate)}T${this.formatDateToHHMMSS(oStartDate)}`);
                    let utcStart = localStart.toISOString();
                    let utcStartDate = utcStart.split("T")[0];
                    let utcStartTime = utcStart.split("T")[1].replace("Z", "");
                    const oStartBoundary = new sap.ui.model.Filter({
                        filters: [
                            new sap.ui.model.Filter("sdl_startdt", sap.ui.model.FilterOperator.EQ, utcStartDate),
                            new sap.ui.model.Filter("sdl_starttm", sap.ui.model.FilterOperator.GE, utcStartTime)
                        ],
                        and: true
                    });
                    const oBetweenRange = new sap.ui.model.Filter({
                        filters: [oStartBoundary],
                        and: false // false = OR
                    });
                    aFilters.push(oBetweenRange);
                    return aFilters;
                } else {
                    MessageBox.error(this.i18nModel.getText("DateRangeErrBlank"));
                    this.JobDetailTable.setShowOverlay(true);
                }
            } catch (oError) {
                this.busyDialog.close();
                MessageBox.error(oError.message || this.i18nModel.getText("unexpErr"));
                this.JobDetailTable.setShowOverlay(true);
            }
        },
        onRefreshData: async function () {
            const jobModel = this.getView().getModel("jobModel");
            const aFilters = this.createFilters();

            if (aFilters) {
                // Bind to the entity set
                const oBinding = this.custModel.bindList("/SchedulerTask", undefined, undefined, aFilters);
                try {
                    // usage
                    const aContexts = await this.requestAllContexts(oBinding, 5000);

                    // Fetch actual data objects
                    const aData = await Promise.all(aContexts.map(oContext => oContext.requestObject()));
                    this.busyDialog.close();
                    this.JobDetailTable.setShowOverlay(false);
                    aData.JobDetailsTitle = "Job Details (" + aData.length + ")";
                    jobModel.setProperty("/JobDetailsTitle", aData.JobDetailsTitle);
                    jobModel.setProperty("/results", aData);
                } catch (oError) {
                    // Handle any errors that occur during data refresh
                    MessageBox.error(this.i18nModel.getText("unexpErr"));
                } finally {
                    if (this.busyDialog) {
                        this.busyDialog.close();
                    }
                    if (this.JobDetailTable) {
                        this.JobDetailTable.setShowOverlay(false);
                    }
                }
            }
        },
        requestAllContexts: async function (oBinding, iBatchSize = 5000) {
            const aAll = [];
            let iStart = 0;

            while (true) {
                const aPage = await oBinding.requestContexts(iStart, iBatchSize);

                if (!aPage.length) break;

                aAll.push(...aPage);
                iStart += aPage.length;

                // stop if the page returned fewer than requested (end reached)
                if (aPage.length < iBatchSize) break;
            }
            return aAll;
        },
        //Job Name
        onValueHelpJobName: function () {
            if (!this._jobDialog) {
                this._jobDialog = sap.ui.xmlfragment("com.bpcfn.jobscheduler.fragments.jobNameValueHelp", this);
                this.getView().addDependent(this._jobDialog);
            }
            this._jobDialog.open();
        },
        onVHJobNameSearch: function (oEvent) {
            // TableSelectDialog "search" fires on its own dialog; filter its
            // items binding directly off the event source.
            var sQuery = oEvent.getParameter("value");
            var oBinding = oEvent.getSource().getBinding("items");
            if (oBinding) {
                // VH_Job exposes the property as "Jobname" (V4 is case-
                // sensitive); filtering on "jobname" matched nothing.
                oBinding.filter(sQuery
                    ? [new Filter("Jobname", FilterOperator.Contains, sQuery)]
                    : []);
            }
        },
        onJobSelectConfirm: function (oEvent) {
            // TableSelectDialog returns selectedContexts / selectedItems, NOT
            // selectedItem. And the input + filter use JobNameText, so write
            // that field (writing /JobName landed in a dead field before).
            var aCtx = oEvent.getParameter("selectedContexts");
            var oCtx = (aCtx && aCtx.length) ? aCtx[0] : null;
            if (!oCtx) {
                var aItems = oEvent.getParameter("selectedItems");
                if (aItems && aItems.length) { oCtx = aItems[0].getBindingContext("custModel"); }
            }
            if (oCtx) {
                var o = oCtx.getObject();
                this.getView().getModel("filterModel").setProperty("/JobNameText", o.Jobname);
            }
        },
        //Created By
        onValueHelpCreatedBy: function () {
            if (!this._createdByDialog) {
                this._createdByDialog = sap.ui.xmlfragment("com.bpcfn.jobscheduler.fragments.creatorValueHelp", this);
                this.getView().addDependent(this._createdByDialog);
            }
            this._createdByDialog.open();
        },
        onVHCreatedBySearch: function (oEvent) {
            var sQuery = oEvent.getParameter("value");
            var oBinding = oEvent.getSource().getBinding("items");
            if (oBinding) {
                // VH_GenericUser exposes the user as "Bname".
                oBinding.filter(sQuery
                    ? [new Filter("Bname", FilterOperator.Contains, sQuery)]
                    : []);
            }
        },
        onCreatorSelectConfirm: function (oEvent) {
            var aCtx = oEvent.getParameter("selectedContexts");
            var oCtx = (aCtx && aCtx.length) ? aCtx[0] : null;
            if (!oCtx) {
                var aItems = oEvent.getParameter("selectedItems");
                if (aItems && aItems.length) { oCtx = aItems[0].getBindingContext("custModel"); }
            }
            if (oCtx) {
                var o = oCtx.getObject();
                // generic user id if present, else the creator - matches the
                // list column and what createFilters expects.
                this.getView().getModel("filterModel").setProperty("/CreatedBy",
                    o.Bname || o.generic_user_id || o.createdby);
            }
        },
        onJobSelected: function (oEvent) {
            if (oEvent.getParameter("rowIndex") !== -1) {
                this.selJobRowData = oEvent.getParameter("rowContext").getObject();
                this.selRowData = oEvent.getParameter("rowContext").getObject();
                // status holds a one-character code from domain
                // /BPCFN/GR_DM_SCHDSTAT - I / C / E / F, plus S (Scheduled).
                // These tests used to compare against "Finished" and
                // "Scheduled", which the field never contains, so both
                // buttons were permanently disabled. Leftover /shl/ text
                // comparisons from before the field held codes.
                const sRowStatus = this.selRowData.status;

                //Mannual Activity Button enablement logic
                this.getView().getModel("jobModel")
                    .setProperty("/ManualActivityEnabled", sRowStatus === "C");

                //Cancel Job Button enablement logic
                // Only a job that has not yet run can be cancelled. 'S' is
                // scheduled; 'I' is already in progress and cannot be
                // stopped cleanly mid-flight.
                this.getView().getModel("jobModel")
                    .setProperty("/CancelEnabled", sRowStatus === "S");
                this._checkAuth(true);
            } else {
                this.initializeData();
                this._checkAuth(false);
            }
        },
        /**
         * Authorization check.
         *
         * The /CheckAuth entity set does not exist in the /bpcfn/ service.
         * The original /shl/ service exposed it; ours does not.
         *
         * This matters more than it looks: the OData V4 model groups these
         * reads into one $batch, and a 404 on the FIRST request aborts every
         * later request in the same batch with "HTTP request was not
         * processed because the previous request failed". A single missing
         * entity set therefore blanks the whole page - SchedulerTask,
         * VH_Status, VH_Job and VH_GenericUser all fail as collateral.
         *
         * Until the backend exposes it, the flags default to enabled and the
         * backend remains the real authority - an unauthorised user still
         * gets rejected on the actual create/copy call, they just are not
         * greyed out in advance.
         *
         * TO RESTORE THE SERVER-SIDE CHECK: expose a CheckAuth entity set or
         * function on /BPCFN/SD_XB_SCHD_TASK_API returning a CheckAuth
         * boolean, then set _bCheckAuthAvailable = true below.
         */
        _bCheckAuthAvailable: false,

        _checkAuth: function (bRowSelected) {
            const oJobModel = this.getView().getModel("jobModel");

            if (!this._bCheckAuthAvailable) {
                oJobModel.setProperty("/CheckAuth", true);
                oJobModel.setProperty("/CreateEnabled", true);
                oJobModel.setProperty("/CopyEnabled", !!bRowSelected);
                return Promise.resolve();
            }

            return this.custModel.bindContext("/CheckAuth").requestObject().then(
                function (oData) {
                    const bCheckAuth = !!(oData && oData.value && oData.value[0] && oData.value[0].CheckAuth === true);
                    oJobModel.setProperty("/CheckAuth", bCheckAuth);
                    oJobModel.setProperty("/CreateEnabled", bCheckAuth);
                    oJobModel.setProperty("/CopyEnabled", !!bRowSelected && bCheckAuth);
                }
            ).catch(function () {
                oJobModel.setProperty("/CheckAuth", false);
                oJobModel.setProperty("/CreateEnabled", false);
                oJobModel.setProperty("/CopyEnabled", false);
            });
        },
        onManualActivityJob: function () {
            const keyFilter = new sap.ui.model.Filter("guid", sap.ui.model.FilterOperator.EQ, this.selRowData.guid);
            const gpItemListBinding = this.custModel.bindList("/SchedulerTask", undefined, undefined, keyFilter);
            this.busyDialog.open();
            gpItemListBinding.requestContexts().then(
                function (contexts) {
                    this.busyDialog.close();
                    if (!contexts || contexts.length === 0) {
                        return;
                    }
                    const data = contexts[0];
                    if (!data) {
                        return;
                    }
                    data.setProperty("mt_flag", "X");
                    return;
                }.bind(this)
            )
                .then(
                    function () {
                        this.busyDialog.close();
                        MessageBox.success(this.i18nModel.getText("End") + this.selRowData.jobname + this.i18nModel.getText("compltd"));
                    }.bind(this)
                )
                .catch(
                    function (err) {
                        this.busyDialog.close();
                        MessageBox.error(this.i18nModel.getText("FailedMann"));
                    }.bind(this)
                );
        },
        onCreateJob: function () {
            this.oRouter.navTo('NewSchedule', {
                jobId: "create",
                jobName: "new",
                jobRecCount: "0"
            })
        },
        onCopyJob: function () {
            this.oRouter.navTo('NewSchedule', {
                jobId: this.selRowData.guid,
                jobName: this.selRowData.jobname + "_Copy",
                jobRecCount: this.selRowData.job_rec_count
            })
        },
        onJobDetails: function (oEvent) {
            let selRow = oEvent.getSource().getParent().getBindingContext("jobModel").getObject();
            this.oRouter.navTo('JobDetail', {
                jobId: selRow.guid,
                jobRecCount: selRow.job_rec_count
            })
        },

        createColumnConfig: function () {
            const aCols = [];
            // Regular string properties
            aCols.push({ label: this.i18nModel.getText("JobName"), property: "jobname", type: EdmType.String, width: 24 });
            aCols.push({ label: this.i18nModel.getText("Status"), property: "status", type: EdmType.String, width: 10 });
            aCols.push({ label: this.i18nModel.getText("Version"), property: "version", type: EdmType.String, width: 10 });
            aCols.push({ label: this.i18nModel.getText("TaskType"), property: "task_type", type: EdmType.String, width: 8 });
            // fiscalyearperiod is derived per row in interleaveParentAndTasks -
            // the export takes flat properties, not formatters.
            aCols.push({ label: this.i18nModel.getText("FiscalYearPeriod"), property: "fiscalyearperiod", type: EdmType.String, width: 15 });
            aCols.push({ label: this.i18nModel.getText("ConsGroup"), property: "con_grp", type: EdmType.String, width: 12 });
            aCols.push({ label: this.i18nModel.getText("PlannedStart"), property: "sdl_DateTime", type: EdmType.String, width: 25 });
            aCols.push({ label: this.i18nModel.getText("End"), property: "enddatetime", type: EdmType.String, width: 25 });
            aCols.push({
                label: this.i18nModel.getText("Duration"),
                property: "duration",
                type: EdmType.Number,
                scale: 0
            });
            aCols.push({ label: this.i18nModel.getText("CreatedBy"), property: "generic_user_id", type: EdmType.String, width: 10 });
            aCols.push({ label: this.i18nModel.getText("CreatedOn"), property: "creation_datetime", type: EdmType.String, width: 25 });
            aCols.push({ label: this.i18nModel.getText("TaskSequence"), property: "seqno", type: EdmType.String, width: 15 });
            aCols.push({ label: this.i18nModel.getText("TaskID"), property: "task_id", type: EdmType.String, width: 10 });
            aCols.push({ label: this.i18nModel.getText("TaskDesc"), property: "task_desc", type: EdmType.String, width: 30 });
            aCols.push({ label: this.i18nModel.getText("JobStatus"), property: "j_status", type: EdmType.String, width: 25 });
            return aCols;
        },
        onExport: async function () {
            if (!this._oTable) {
                this._oTable = this.JobDetailTable;
            }
            this.busyDialog.open();

            const aFilters = this.createFilters();
            if (!aFilters) {
                this.busyDialog.close();
                return;
            }
            const aSorters = [
                new sap.ui.model.Sorter("creation_date", true),   // desc
                new sap.ui.model.Sorter("creation_time", true),   // desc
                new sap.ui.model.Sorter("sdl_startdt", true),    // desc
                new sap.ui.model.Sorter("sdl_starttm", true),    // desc
                new sap.ui.model.Sorter("jobname", true),    // desc
                new sap.ui.model.Sorter("createdby", true)     // desc (watch the case)
            ];
            const mParameters = {
                // Nav property is "_Tasks" (capital T) - "_tasks" makes the
                // $expand fail and the task rows never arrive.
                $expand: "_Tasks($orderby=seqno asc)"
            };
            const oBinding = this.custModel.bindList("/SchedulerTask", undefined, aSorters, aFilters, mParameters);

            let oSheet;
            try {
                // Load all (adjust size as needed; consider paging for very large sets)
                const aContexts = await oBinding.requestContexts(0, 99999);
                const aData = await Promise.all(aContexts.map(function (ctx) {
                    return ctx.requestObject();
                }));
                // Assuming: this.formatter.formatDateTime(dateStr, timeStr) is available
                const aDataWithFormatted = aData.map(function (item) {
                    const start = formatter.formatDateTime(item.sdl_startdt, item.sdl_starttm);
                    const end = formatter.formatDateTime(item.enddate, item.endtime);
                    const creation = formatter.formatDateTime(item.creation_date, item.creation_time);

                    return {
                        ...item,
                        // Overwrite or add new fields with the computed values
                        enddatetime: end,
                        creation_datetime: creation,
                        sdl_DateTime: start,
                        // flat field for the export - the spreadsheet takes
                        // properties, not formatters, so the year/period join
                        // has to happen here as well as in the view
                        fiscalyearperiod: formatter.fiscalYearPeriod(item.fc_year, item.fc_period)
                    };

                });
                let aRearrangedData = this.interleaveParentAndTasks(aDataWithFormatted);
                const aCols = this.createColumnConfig();
                const oSettings = {
                    workbook: {
                        columns: aCols,
                        hierarchyLevel: "__level",
                        context: {
                            sheetName: this.i18nModel.getText("sheetName")
                        },
                    },

                    dataSource: aRearrangedData,
                    fileName: this.i18nModel.getText("fileName"),
                    worker: false
                };

                oSheet = new Spreadsheet(oSettings);
                await oSheet.build();
            } catch (oError) {
                // Handle any errors during data retrieval or export
                if (MessageBox && MessageBox.error) {
                    MessageBox.error(oError && oError.message ? oError.message : "An error occurred during export.");
                } else {
                    /* eslint-disable no-console */
                    console.error("Export failed", oError);
                    /* eslint-enable no-console */
                }
            } finally {
                if (oSheet) {
                    oSheet.destroy();
                }
                if (this.busyDialog) {
                    this.busyDialog.close();
                }
            }
        },
        interleaveParentAndTasks: function (aData) {
            if (!Array.isArray(aData)) return [];

            return aData.flatMap(parent => {
                const tasks = Array.isArray(parent._Tasks) ? parent._Tasks : [];

                // Clone parent and drop _Tasks to avoid nesting in the interleaved output
                const { _Tasks, ...parentClone } = parent;

                const parentRow = {
                    __level: 0,      // helpful marker for UI
                    ...parentClone
                };

                const taskRows = tasks.map((t, idx) => ({
                    __level: 1,     // helpful marker for UI
                    ...t,
                    jobname: "",
                }));
                return [parentRow, ...taskRows];
            });
        }
    });
});