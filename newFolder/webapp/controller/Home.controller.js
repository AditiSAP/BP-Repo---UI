sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/BusyDialog",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "com/bpcfn/jobscheduler/model/formatter",
    "sap/ui/export/library",
    "sap/ui/export/Spreadsheet"
], function (Controller, JSONModel, BusyDialog, MessageBox, MessageToast, Filter, FilterOperator, Sorter, formatter, exportLibrary, Spreadsheet) {
    "use strict";

    const EdmType = exportLibrary.EdmType;

    return Controller.extend("com.bpcfn.jobscheduler.controller.Home", {
        formatter: formatter,

        onInit: function () {
            this.busyDialog    = new BusyDialog();
            this.JobDetailTable = this.byId("idJobDetTable");
            this.custModel     = this.getOwnerComponent().getModel("custModel");
            this.oRouter       = this.getOwnerComponent().getRouter();
            this.oRouter.getRoute("Home").attachPatternMatched(this._onHomeMatched, this);
            this.i18nModel     = this.getOwnerComponent().getModel("i18n").getResourceBundle();

            this.jobModel = new JSONModel();
            this.jobModel.setSizeLimit(99999);
            this.getView().setModel(this.jobModel, "jobModel");

            // statusFilterModel feeds the Status ValueHelp popup in the same
            // way it fed the original MultiComboBox.
            this._loadStatusFilter();

            // MDC maps selectionMode="Single" to SingleSelectLeft (radio buttons).
            // After the inner table is ready, switch to SingleSelectMaster so the
            // row highlights on click without showing a radio-button column.
            if (typeof this.JobDetailTable.initialized === "function") {
                this.JobDetailTable.initialized().then(function () {
                    var oInner = this.JobDetailTable._oTable;
                    if (oInner && typeof oInner.setMode === "function") {
                        oInner.setMode("SingleSelectMaster");
                    }
                }.bind(this)).catch(function () {});
            }
        },

        /**
         * Build the status filter list: "All" first, then the domain values.
         * Same logic as the original; result exposed as statusFilterModel.
         */
        _loadStatusFilter: async function () {
            const aItems = [{ key: "", text: this.i18nModel.getText("StatusAll") }];
            try {
                const oBinding = this.custModel.bindList("/VH_Status", undefined,
                    [new Sorter("Status")]);
                const aCtx = await oBinding.requestContexts(0, 999);
                aCtx.forEach(function (oCtx) {
                    const sCode = oCtx.getObject().Status;
                    if (sCode) {
                        aItems.push({ key: sCode, text: formatter.statusText(sCode) });
                    }
                });
            } catch (oErr) {
                // VH_Status unreadable – leave "All" so the filter still works
            }
            this.getView().setModel(new JSONModel({ items: aItems }), "statusFilterModel");
        },

        _onHomeMatched: async function () {
            this._checkAuth(false);

            const oFilterBar   = this.byId("filterbar");
            const oFilterbarVM = this.byId("filterbarVM");

            // In FLP/BTP deployment, sap.ui.fl loads the FilterBar's saved variant
            // from LREP asynchronously. Wait for both the FilterBar condition model
            // AND the VariantManagement to finish initialising before setting defaults,
            // so initializeData() has the full picture before it writes.
            const aInits = [];
            if (oFilterBar   && typeof oFilterBar.initialized   === "function") {
                aInits.push(oFilterBar.initialized().catch(function () {}));
            }
            if (oFilterbarVM && typeof oFilterbarVM.initialized === "function") {
                aInits.push(oFilterbarVM.initialized().catch(function () {}));
            }
            if (aInits.length) { await Promise.all(aInits); }

            this.initializeData();

            // KPI drill-down: the dashboard stashes a status and optional
            // scope on the Component before navigating here. Apply them as
            // FilterBar conditions so the list lands on exactly that tile's
            // jobs, then clear so normal navigation is not stuck with them.
            const oComp = this.getOwnerComponent();
            if (oComp._kpiStatusFilter !== undefined && oComp._kpiStatusFilter !== null) {
                const mKpi = {
                    status: oComp._kpiStatusFilter
                        ? [{ operator: "EQ", values: [oComp._kpiStatusFilter], validated: "NotValidated" }]
                        : []
                };
                if (oComp._kpiScope) {
                    if (oComp._kpiScope.year) {
                        mKpi.fcYear = [{ operator: "EQ", values: [oComp._kpiScope.year], validated: "NotValidated" }];
                    }
                    if (oComp._kpiScope.period) {
                        mKpi.fcPeriod = [{ operator: "EQ", values: [oComp._kpiScope.period], validated: "NotValidated" }];
                    }
                }
                this._mergeFilterConditions(oFilterBar, mKpi);
                oComp._kpiStatusFilter = undefined;
                oComp._kpiScope        = undefined;
            }

            if (this.custModel && typeof this.custModel.refresh === "function") {
                this.custModel.refresh();
            }

            await this.onRefreshData();
        },

        initializeData: function () {
            this.JobDetailTable.clearSelection();

            // Default window: 30 days back, 10 days forward.
            const stDate  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

            this._dfltDateStart = stDate;
            this._dfltDateEnd   = endDate;

            // Set FilterBar to default state: date range filled, everything else cleared.
            // _setFilterConditions uses ConditionModel.setConditions() when available —
            // plain setProperty() bypasses the change-event pipeline in MDC 1.120 and
            // the FilterField display never updates.
            this._setFilterConditions(this.byId("filterbar"), {
                dateRange: [{ operator: "BT", values: [stDate, endDate], validated: "NotValidated" }],
                jobname:   [],
                createdby: [],
                status:    [],
                fcYear:    [],
                fcPeriod:  []
            });

            this.getView().getModel("jobModel").setData({
                "CheckAuth":              false,
                "CreateEnabled":          false,
                "CopyEnabled":            false,
                "CancelEnabled":          false,
                "ManualActivityEnabled":  false
            }, true);
        },

        // ── Condition-model helpers ──────────────────────────────────────────
        // MDC's $filters model is a ConditionModel in 1.120. setConditions() is
        // its proper API for atomic full-replacement. setProperty() does work but
        // can skip the model's internal change-event pipeline on some versions,
        // leaving FilterFields stale. We try setConditions first.

        _setFilterConditions: function (oFilterBar, mConditions) {
            const oCondModel = oFilterBar ? oFilterBar.getModel("$filters") : null;
            if (!oCondModel) { return; }
            if (typeof oCondModel.setConditions === "function") {
                oCondModel.setConditions(mConditions);
            } else {
                const self = this;
                Object.keys(mConditions).forEach(function (sKey) {
                    oCondModel.setProperty("/conditions/" + sKey, mConditions[sKey]);
                });
            }
        },

        // Non-destructive merge: only the keys in mPartial are updated; the rest
        // (e.g. the dateRange set by initializeData) are preserved.
        _mergeFilterConditions: function (oFilterBar, mPartial) {
            const oCondModel = oFilterBar ? oFilterBar.getModel("$filters") : null;
            if (!oCondModel) { return; }
            const mCurrent = typeof oCondModel.getConditions === "function"
                ? Object.assign({}, oCondModel.getConditions())
                : (oCondModel.getProperty("/conditions") || {});
            const mMerged = Object.assign({}, mCurrent, mPartial);
            if (typeof oCondModel.setConditions === "function") {
                oCondModel.setConditions(mMerged);
            } else {
                Object.keys(mPartial).forEach(function (sKey) {
                    oCondModel.setProperty("/conditions/" + sKey, mPartial[sKey]);
                });
            }
        },

        // Converts an MDC date condition array to concrete {oStartDate, oEndDate}.
        // Handles all operators exposed on the FilterField (BT, EQ, GE/GT, LE/LT,
        // TODAY, YESTERDAY, TOMORROW, LASTDAYS, NEXTDAYS, TODAYFROMTO).
        // Falls back to dfltStart/dfltEnd when the condition array is empty or the
        // operator is unrecognised.
        _resolveDateCondition: function (aDateConds, dfltStart, dfltEnd) {
            let oStartDate, oEndDate;

            if (aDateConds.length && aDateConds[0]) {
                const oCond = aDateConds[0];
                const v0    = oCond.values && oCond.values[0];
                const v1    = oCond.values && oCond.values[1];
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const eod   = new Date(); eod.setHours(23, 59, 59, 999);
                const DAY   = 86400000;

                switch (oCond.operator) {
                    case "BT":
                        oStartDate = v0 ? new Date(v0) : undefined;
                        oEndDate   = v1 ? new Date(v1) : undefined;
                        break;
                    case "EQ":
                        oStartDate = v0 ? new Date(v0) : undefined;
                        if (oStartDate) {
                            oStartDate.setHours(0, 0, 0, 0);
                            oEndDate = new Date(oStartDate); oEndDate.setHours(23, 59, 59, 999);
                        }
                        break;
                    case "GE": case "GT":
                        oStartDate = v0 ? new Date(v0) : undefined;
                        if (oStartDate) { oEndDate = new Date(oStartDate.getTime() + 30 * DAY); }
                        break;
                    case "LE": case "LT":
                        oEndDate = v0 ? new Date(v0) : undefined;
                        if (oEndDate) { oStartDate = new Date(oEndDate.getTime() - 29 * DAY); }
                        break;
                    case "TODAY":
                        oStartDate = new Date(today); oEndDate = new Date(eod);
                        break;
                    case "YESTERDAY":
                        oStartDate = new Date(today.getTime() - DAY); oStartDate.setHours(0, 0, 0, 0);
                        oEndDate   = new Date(oStartDate); oEndDate.setHours(23, 59, 59, 999);
                        break;
                    case "TOMORROW":
                        oStartDate = new Date(today.getTime() + DAY); oStartDate.setHours(0, 0, 0, 0);
                        oEndDate   = new Date(oStartDate); oEndDate.setHours(23, 59, 59, 999);
                        break;
                    case "LASTDAYS": {
                        const n = parseInt(v0, 10) || 30;
                        oEndDate   = new Date(eod);
                        oStartDate = new Date(today.getTime() - (n - 1) * DAY);
                        break;
                    }
                    case "NEXTDAYS": {
                        const n = parseInt(v0, 10) || 10;
                        oStartDate = new Date(today);
                        oEndDate   = new Date(today.getTime() + n * DAY); oEndDate.setHours(23, 59, 59, 999);
                        break;
                    }
                    case "TODAYFROMTO": {
                        const before = parseInt(v0, 10) || 0;
                        const after  = parseInt(v1, 10) || 0;
                        oStartDate = new Date(today.getTime() - before * DAY);
                        oEndDate   = new Date(today.getTime() + after  * DAY); oEndDate.setHours(23, 59, 59, 999);
                        break;
                    }
                    default: break;
                }
            }

            if (!oStartDate || !oEndDate) {
                oStartDate = dfltStart;
                oEndDate   = dfltEnd;
            }

            return { oStartDate: oStartDate, oEndDate: oEndDate };
        },

        onClear: async function () {
            this.initializeData();
            await this.onRefreshData();
        },

        // Fired by the MDC FilterBar on every condition change (including the built-in
        // Clear button). When the required dateRange condition is empty, restore the
        // default range and refresh — this prevents required-field validation from
        // blocking the Go button after Clear.
        onFiltersChanged: function () {
            if (this._bRestoringDefaults) { return; }
            const oFilterBar = this.byId("filterbar");
            if (!oFilterBar || !this._dfltDateStart) { return; }

            const oCondModel  = oFilterBar.getModel("$filters");
            const aDateConds  = oCondModel
                ? (oCondModel.getProperty("/conditions/dateRange") || [])
                : ((oFilterBar.getConditions() || {}).dateRange || []);

            if (!aDateConds.length) {
                this._bRestoringDefaults = true;
                this._setFilterConditions(oFilterBar, {
                    dateRange: [{ operator: "BT", values: [this._dfltDateStart, this._dfltDateEnd], validated: "NotValidated" }],
                    jobname:   [],
                    createdby: [],
                    status:    [],
                    fcYear:    [],
                    fcPeriod:  []
                });
                this._bRestoringDefaults = false;
                this.onRefreshData();
            }
        },

        // ─── Cancel ──────────────────────────────────────────────────────────
        onCanSelJob: function () { this.onCancelJob("SJ"); },
        onCanEntJob: function () { this.onCancelJob("EJ"); },

        onCancelJob: async function (sMode) {
            if (sMode !== "SJ" && sMode !== "EJ") {
                MessageBox.error(this.i18nModel.getText("FailedCancel"));
                return;
            }
            if (!this.selJobRowData) {
                return;
            }

            const oBundle  = this.i18nModel;
            const sPrompt = (sMode === "EJ")
                ? oBundle.getText("ConfirmCancelSeries")
                : oBundle.getText("ConfirmCancelOccurrence");

            MessageBox.confirm(sPrompt, {
                onClose: async function (sAction) {
                    if (sAction !== MessageBox.Action.OK) { return; }
                    this.busyDialog.open();
                    try {
                        const keyFilter = [
                            new Filter("guid",          FilterOperator.EQ, this.selJobRowData.guid),
                            new Filter("job_rec_count", FilterOperator.EQ, this.selJobRowData.job_rec_count)
                        ];
                        const oBinding  = this.custModel.bindList("/SchedulerTask", undefined, undefined, keyFilter);
                        const aContexts = await oBinding.requestContexts();
                        if (!aContexts || aContexts.length === 0) {
                            MessageBox.error(oBundle.getText("FailedCancel"));
                            return;
                        }

                        const oMeta      = this.custModel.getMetaModel();
                        const sContainer = await oMeta.requestObject("/$EntityContainer");
                        const sNamespace = sContainer.substring(0, sContainer.lastIndexOf("."));

                        const oOperation = this.custModel.bindContext(
                            sNamespace + ".cancelJob(...)", aContexts[0]);
                        oOperation.setParameter("cancel_mode", sMode);
                        await oOperation.execute();

                        MessageToast.show(oBundle.getText("CancelSubmitted"));
                        try {
                            await this.custModel.refresh();
                            this.initializeData();
                            await this.onRefreshData();
                        } catch (oRefreshErr) {
                            // list may be stale; the cancel itself succeeded
                        }
                    } catch (oError) {
                        /* eslint-disable no-console */
                        console.error("[CancelJob] action failed", oError);
                        /* eslint-enable no-console */
                        let sDetail = oError && oError.message ? oError.message : "";
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

        // ─── Date helpers ────────────────────────────────────────────────────
        formatDateToYYYYMMDD: function (oDate) {
            if (!oDate) return "";
            const year  = oDate.getFullYear();
            const month = String(oDate.getMonth() + 1).padStart(2, "0");
            const day   = String(oDate.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        },
        formatDateToHHMMSS: function (oDate) {
            if (!oDate) return "";
            const hour = String(oDate.getHours()).padStart(2, "0");
            const min  = String(oDate.getMinutes()).padStart(2, "0");
            const sec  = String(oDate.getSeconds()).padStart(2, "0");
            return `${hour}:${min}:${sec}`;
        },

        // ─── Filter construction ─────────────────────────────────────────────
        createFilters: function () {
            try {
                const oFilterBar = this.byId("filterbar");
                const oCondModel = oFilterBar.getModel("$filters");

                // getConditions() is the public API. Fall back to reading the
                // ConditionModel directly if getConditions() returns nothing useful
                // (can happen on some 1.120 patch levels before the first search).
                let oConditions = oFilterBar.getConditions() || {};
                const bEmpty = !oConditions || !Object.keys(oConditions).some(function (k) {
                    return oConditions[k] && oConditions[k].length;
                });
                if (bEmpty && oCondModel) {
                    oConditions = oCondModel.getProperty("/conditions") || {};
                }

                const aFilters = [];

                // ── Job Name ───────────────────────────────────────────
                const aJobConds = oConditions.jobname || [];
                if (aJobConds.length && aJobConds[0].values && aJobConds[0].values[0]) {
                    const sJob = String(aJobConds[0].values[0]).trim();
                    if (sJob) {
                        aFilters.push(new Filter("jobname",
                            aJobConds[0].operator === "EQ" ? FilterOperator.EQ : FilterOperator.Contains, sJob));
                    }
                }

                // ── Created By ─────────────────────────────────────────
                const aCreatorConds = oConditions.createdby || [];
                if (aCreatorConds.length && aCreatorConds[0].values && aCreatorConds[0].values[0]) {
                    const creator = String(aCreatorConds[0].values[0]);
                    if (creator) {
                        aFilters.push(new Filter({
                            filters: [
                                new Filter("generic_user_id", FilterOperator.Contains, creator),
                                new Filter("createdby",       FilterOperator.Contains, creator)
                            ],
                            and: false
                        }));
                    }
                }

                // ── Status (multi) ─────────────────────────────────────
                const aStatusKeys = (oConditions.status || [])
                    .map(function (c) { return c.values && c.values[0]; })
                    .filter(function (k) { return k && k !== ""; });
                if (aStatusKeys.length) {
                    aFilters.push(new Filter({
                        filters: aStatusKeys.map(function (k) {
                            return new Filter("status", FilterOperator.EQ, k);
                        }),
                        and: false
                    }));
                }

                // ── Fiscal Year ────────────────────────────────────────
                const aYearConds = oConditions.fcYear || [];
                if (aYearConds.length && aYearConds[0].values && aYearConds[0].values[0]) {
                    const sYear = String(aYearConds[0].values[0]).trim();
                    if (sYear) {
                        aFilters.push(new Filter("fc_year", FilterOperator.EQ, sYear.padStart(4, "0")));
                    }
                }

                // ── Fiscal Period ──────────────────────────────────────
                const aPeriodConds = oConditions.fcPeriod || [];
                if (aPeriodConds.length && aPeriodConds[0].values && aPeriodConds[0].values[0]) {
                    const sPeriod = String(aPeriodConds[0].values[0]).trim();
                    if (sPeriod) {
                        aFilters.push(new Filter("fc_period", FilterOperator.EQ, sPeriod.padStart(3, "0")));
                    }
                }

                // ── Date boundary filters ──────────────────────────────
                // Skip date when fiscal year AND period are both set (KPI drill-down:
                // the period already scopes the data precisely).
                if (aYearConds.length > 0 && aPeriodConds.length > 0) {
                    return aFilters;
                }

                // Resolve all MDC date operators (BT, TODAY, LASTDAYS, etc.) to
                // concrete Date objects. Falls back to initializeData defaults.
                const oResolved = this._resolveDateCondition(
                    oConditions.dateRange || [],
                    this._dfltDateStart,
                    this._dfltDateEnd
                );
                const oStartDate = oResolved.oStartDate;
                const oEndDate   = oResolved.oEndDate;

                if (!oStartDate || !oEndDate) {
                    MessageBox.error(this.i18nModel.getText("DateRangeErrBlank"));
                    return undefined;
                }

                const rangeMs = oEndDate.getTime() - oStartDate.getTime();
                if (rangeMs > 180 * 24 * 60 * 60 * 1000) {
                    MessageBox.error(this.i18nModel.getText("DateRangeErr"));
                    return undefined;
                }

                this.busyDialog.open();
                const utcStart     = new Date(`${this.formatDateToYYYYMMDD(oStartDate)}T${this.formatDateToHHMMSS(oStartDate)}`).toISOString();
                const utcEnd       = new Date(`${this.formatDateToYYYYMMDD(oEndDate)}T${this.formatDateToHHMMSS(oEndDate)}`).toISOString();
                const utcStartDate = utcStart.split("T")[0];
                const utcStartTime = utcStart.split("T")[1].replace("Z", "");
                const utcEndDate   = utcEnd.split("T")[0];
                const utcEndTime   = utcEnd.split("T")[1].replace("Z", "");

                aFilters.push(new Filter({
                    filters: [
                        new Filter({ filters: [
                            new Filter("sdl_startdt", FilterOperator.GT, utcStartDate),
                            new Filter("sdl_startdt", FilterOperator.LT, utcEndDate)
                        ], and: true }),
                        new Filter({ filters: [
                            new Filter("sdl_startdt", FilterOperator.EQ, utcStartDate),
                            new Filter("sdl_starttm", FilterOperator.GE, utcStartTime)
                        ], and: true }),
                        new Filter({ filters: [
                            new Filter("sdl_startdt", FilterOperator.EQ, utcEndDate),
                            new Filter("sdl_starttm", FilterOperator.LE, utcEndTime)
                        ], and: true })
                    ],
                    and: false
                }));
                return aFilters;
            } catch (oError) {
                this.busyDialog.close();
                MessageBox.error(oError.message || this.i18nModel.getText("unexpErr"));
            }
        },

        // ─── Data refresh ────────────────────────────────────────────────────
        onRefreshData: async function () {
            const jobModel  = this.getView().getModel("jobModel");
            const aFilters  = this.createFilters();

            if (aFilters) {
                const oBinding = this.custModel.bindList("/SchedulerTask", undefined, undefined, aFilters);
                try {
                    const aContexts = await this.requestAllContexts(oBinding, 5000);
                    const aData     = await Promise.all(aContexts.map(function (oCtx) {
                        return oCtx.requestObject();
                    }));
                    this.busyDialog.close();
                    jobModel.setProperty("/JobDetailsTitle", "Job Details");
                    jobModel.setProperty("/results", aData);
                } catch (oError) {
                    MessageBox.error(this.i18nModel.getText("unexpErr"));
                } finally {
                    if (this.busyDialog) { this.busyDialog.close(); }
                }
            }
        },

        requestAllContexts: async function (oBinding, iBatchSize) {
            iBatchSize = iBatchSize || 5000;
            const aAll = [];
            let iStart = 0;
            while (true) {
                const aPage = await oBinding.requestContexts(iStart, iBatchSize);
                if (!aPage.length) { break; }
                aAll.push(...aPage);
                iStart += aPage.length;
                if (aPage.length < iBatchSize) { break; }
            }
            return aAll;
        },

        // ─── Row interaction ─────────────────────────────────────────────────
        /**
         * MDC Table selectionChange fires with aContexts[] containing the
         * currently selected binding contexts (0 = deselected, 1 = selected).
         * Replaces the original sap.ui.table rowSelectionChange handler.
         */
        onJobSelected: function (oEvent) {
            // MDC Table selectionChange: try bindingContexts param first;
            // fall back to the table's own getSelectedContexts() API in case
            // the param comes back undefined/empty in certain MDC Table builds.
            var aContexts = oEvent.getParameter("bindingContexts");
            if ((!aContexts || !aContexts.length) &&
                    typeof this.JobDetailTable.getSelectedContexts === "function") {
                aContexts = this.JobDetailTable.getSelectedContexts();
            }
            if (aContexts && aContexts.length > 0) {
                this.selJobRowData = aContexts[0].getObject();
                this.selRowData    = this.selJobRowData;
                const sRowStatus   = this.selRowData.status;
                this.getView().getModel("jobModel")
                    .setProperty("/ManualActivityEnabled", sRowStatus === "C");
                this.getView().getModel("jobModel")
                    .setProperty("/CancelEnabled", sRowStatus === "S");
                this.getView().getModel("jobModel")
                    .setProperty("/CopyEnabled", true);
                this._checkAuth(true);
            } else {
                this.selJobRowData = null;
                this.selRowData    = null;
                const oJobModel = this.getView().getModel("jobModel");
                oJobModel.setProperty("/ManualActivityEnabled", false);
                oJobModel.setProperty("/CancelEnabled",         false);
                this._checkAuth(false);
            }
        },

        /**
         * MDC Table rowPress fires when any row is pressed.
         * The bindingContext parameter replaces the original RowAction getBindingContext call.
         */
        onJobDetails: function (oEvent) {
            const oContext = oEvent.getParameter("bindingContext");
            const selRow   = oContext.getObject();
            this.oRouter.navTo("JobDetail", {
                jobId:       selRow.guid,
                jobRecCount: selRow.job_rec_count
            });
        },

        // ─── Auth check ──────────────────────────────────────────────────────
        _bCheckAuthAvailable: false,

        _checkAuth: function (bRowSelected) {
            const oJobModel = this.getView().getModel("jobModel");
            if (!this._bCheckAuthAvailable) {
                oJobModel.setProperty("/CheckAuth",    true);
                oJobModel.setProperty("/CreateEnabled", true);
                oJobModel.setProperty("/CopyEnabled",   !!bRowSelected);
                return Promise.resolve();
            }
            return this.custModel.bindContext("/CheckAuth").requestObject().then(
                function (oData) {
                    const bAuth = !!(oData && oData.value && oData.value[0] && oData.value[0].CheckAuth === true);
                    oJobModel.setProperty("/CheckAuth",    bAuth);
                    oJobModel.setProperty("/CreateEnabled", bAuth);
                    oJobModel.setProperty("/CopyEnabled",   !!bRowSelected && bAuth);
                }
            ).catch(function () {
                oJobModel.setProperty("/CheckAuth",    false);
                oJobModel.setProperty("/CreateEnabled", false);
                oJobModel.setProperty("/CopyEnabled",   false);
            });
        },

        // ─── Manual Activity ─────────────────────────────────────────────────
        onManualActivityJob: function () {
            const keyFilter = new Filter("guid", FilterOperator.EQ, this.selRowData.guid);
            const gpItemListBinding = this.custModel.bindList("/SchedulerTask", undefined, undefined, keyFilter);
            this.busyDialog.open();
            gpItemListBinding.requestContexts()
                .then(function (contexts) {
                    this.busyDialog.close();
                    if (!contexts || contexts.length === 0) { return; }
                    contexts[0].setProperty("mt_flag", "X");
                }.bind(this))
                .then(function () {
                    this.busyDialog.close();
                    MessageBox.success(
                        this.i18nModel.getText("manualAct") +
                        this.selRowData.jobname +
                        this.i18nModel.getText("compltd"));
                }.bind(this))
                .catch(function () {
                    this.busyDialog.close();
                    MessageBox.error(this.i18nModel.getText("FailedMann"));
                }.bind(this));
        },

        // ─── Navigation ──────────────────────────────────────────────────────
        onCreateJob: function () {
            this.oRouter.navTo("NewSchedule", {
                jobId: "create", jobName: "new", jobRecCount: "0"
            });
        },
        onCopyJob: function () {
            this.oRouter.navTo("NewSchedule", {
                jobId:       this.selRowData.guid,
                jobName:     this.selRowData.jobname + "_Copy",
                jobRecCount: this.selRowData.job_rec_count
            });
        },

        // ─── Excel export ─────────────────────────────────────────────────────
        createColumnConfig: function () {
            const aCols = [];
            aCols.push({ label: this.i18nModel.getText("JobName"),        property: "jobname",          type: EdmType.String, width: 24 });
            aCols.push({ label: this.i18nModel.getText("Status"),         property: "status",           type: EdmType.String, width: 10 });
            aCols.push({ label: this.i18nModel.getText("Version"),        property: "version",          type: EdmType.String, width: 10 });
            aCols.push({ label: this.i18nModel.getText("TaskType"),       property: "task_type",        type: EdmType.String, width: 8  });
            aCols.push({ label: this.i18nModel.getText("FiscalYearPeriod"), property: "fiscalyearperiod", type: EdmType.String, width: 15 });
            aCols.push({ label: this.i18nModel.getText("ConsGroup"),      property: "con_grp",          type: EdmType.String, width: 12 });
            aCols.push({ label: this.i18nModel.getText("PlannedStart"),   property: "sdl_DateTime",     type: EdmType.String, width: 25 });
            aCols.push({ label: this.i18nModel.getText("End"),            property: "enddatetime",      type: EdmType.String, width: 25 });
            aCols.push({ label: this.i18nModel.getText("Duration"),       property: "duration",         type: EdmType.Number, scale: 0  });
            aCols.push({ label: this.i18nModel.getText("CreatedBy"),      property: "generic_user_id",  type: EdmType.String, width: 10 });
            aCols.push({ label: this.i18nModel.getText("CreatedOn"),      property: "creation_datetime", type: EdmType.String, width: 25 });
            aCols.push({ label: this.i18nModel.getText("TaskSequence"),   property: "seqno",            type: EdmType.String, width: 15 });
            aCols.push({ label: this.i18nModel.getText("TaskID"),         property: "task_id",          type: EdmType.String, width: 10 });
            aCols.push({ label: this.i18nModel.getText("TaskDesc"),       property: "task_desc",        type: EdmType.String, width: 30 });
            aCols.push({ label: this.i18nModel.getText("JobStatus"),      property: "j_status",         type: EdmType.String, width: 25 });
            return aCols;
        },

        onExport: async function () {
            this.busyDialog.open();
            const aFilters = this.createFilters();
            if (!aFilters) {
                this.busyDialog.close();
                return;
            }
            const aSorters = [
                new Sorter("creation_date", true),
                new Sorter("creation_time", true),
                new Sorter("sdl_startdt",   true),
                new Sorter("sdl_starttm",   true),
                new Sorter("jobname",       true),
                new Sorter("createdby",     true)
            ];
            const oBinding = this.custModel.bindList(
                "/SchedulerTask", undefined, aSorters, aFilters,
                { "$expand": "_Tasks($orderby=seqno asc)" });

            let oSheet;
            try {
                const aContexts = await oBinding.requestContexts(0, 99999);
                const aData     = await Promise.all(aContexts.map(function (ctx) {
                    return ctx.requestObject();
                }));
                const aFormatted = aData.map(function (item) {
                    return Object.assign({}, item, {
                        enddatetime:        formatter.formatDateTime(item.enddate,       item.endtime),
                        creation_datetime:  formatter.formatDateTime(item.creation_date, item.creation_time),
                        sdl_DateTime:       formatter.formatDateTime(item.sdl_startdt,   item.sdl_starttm),
                        fiscalyearperiod:   formatter.fiscalYearPeriod(item.fc_year, item.fc_period)
                    });
                });
                const aRearranged = this.interleaveParentAndTasks(aFormatted);
                oSheet = new Spreadsheet({
                    workbook: {
                        columns:       this.createColumnConfig(),
                        hierarchyLevel: "__level",
                        context:       { sheetName: this.i18nModel.getText("sheetName") }
                    },
                    dataSource: aRearranged,
                    fileName:   this.i18nModel.getText("fileName"),
                    worker:     false
                });
                await oSheet.build();
            } catch (oError) {
                MessageBox.error(oError && oError.message ? oError.message : "An error occurred during export.");
            } finally {
                if (oSheet) { oSheet.destroy(); }
                if (this.busyDialog) { this.busyDialog.close(); }
            }
        },

        interleaveParentAndTasks: function (aData) {
            if (!Array.isArray(aData)) { return []; }
            return aData.flatMap(function (parent) {
                const tasks = Array.isArray(parent._Tasks) ? parent._Tasks : [];
                const { _Tasks, ...parentClone } = parent;
                const parentRow = Object.assign({ __level: 0 }, parentClone);
                const taskRows  = tasks.map(function (t) {
                    return Object.assign({ __level: 1 }, t, { jobname: "" });
                });
                return [parentRow, ...taskRows];
            });
        }
    });
});
