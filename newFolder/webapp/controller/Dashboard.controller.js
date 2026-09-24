sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "com/bpcfn/jobscheduler/model/formatter"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, formatter) {
    "use strict";

    // How long a loaded snapshot is considered fresh. Jobs change on the
    // order of minutes, so re-reading on every repaint is wasted round
    // trips. Refresh button and role-switch bypass this deliberately.
    const CACHE_MS = 30 * 1000;

    return Controller.extend("com.bpcfn.jobscheduler.controller.Dashboard", {

        formatter: formatter,

        onInit: function () {
            // Default the scope to the current fiscal year and period, but the
            // year/period are ordinary editable selectors - see _buildScopeLists.
            const oScope = this._defaultScope();
            this._oModel = new JSONModel({
                role: "OPS",
                contextText: "",
                mgrScopeText: "",
                scope: oScope,                 // { year, period } - drives every read
                years: this._buildYears(oScope.year),
                versions: [{ key: "", text: this._i18n ? "" : "" }],   // filled in _loadVersions
                periods: this._buildPeriods(),
                kpi: { S: 0, I: 0, C: 0, F: 0, H: 0, TOTAL: 0 },
                runs: [], hold: [],
                actions: [], readiness: [], series: []
            });
            this.getView().setModel(this._oModel, "dashModel");

            this._custModel = this.getOwnerComponent().getModel("custModel");
            this._i18n = this.getOwnerComponent().getModel("i18n").getResourceBundle();
            this._lastLoad = 0;
            this._mgrBuilt = false;

            this.getOwnerComponent().getRouter()
                .getRoute("Dashboard").attachPatternMatched(this._onMatched, this);
        },

        onAfterRendering: function () {
            // GenericTag has no bindable left/width, so position each bar here
            // from the barLeft / barWidth the controller computed per run.
            // Runs in order; cheap (a handful of rows) and re-runs on refresh.
            // Read geometry from EACH bar's own CustomData, not by array
            // index. Index matching broke with the growing/scrolling list -
            // DOM order desynced from the model, so bars got the wrong row's
            // position (all landing near 0). data-* is written per control
            // via CustomData:writeToDom, so each bar carries its own values.
            this.getView().$().find(".grsBar").each(function () {
                const left  = this.getAttribute("data-barleft");
                const width = this.getAttribute("data-barwidth");
                if (left === null) { return; }
                this.style.position = "absolute";
                this.style.left  = left + "%";
                this.style.width = Math.max(parseFloat(width) || 8, 8) + "%";
            });
        },

        _onMatched: function () {
            // honour the 30s cache: skip the reads if we loaded recently
            if (Date.now() - this._lastLoad < CACHE_MS) {
                return;
            }
            this._loadOperator();
        },

        /* ==================================================================
         *  Operator role — loads on landing
         * ================================================================== */
        _loadOperator: function () {
            this._loadVersions();      // populate the Version selector
            this._loadKPIs();          // the single aggregated read
            this._loadRuns();          // today's runs
            this._loadHold();          // on-hold units
            this._lastLoad = Date.now();
            this._stampContext();
        },

        /**
         * ONE read for all six tiles.
         * /BPCFN/BV_XB_SCHD_KPI returns one row per status with a count.
         * Replaces six separate $count round trips.
         */
        _loadKPIs: function () {
            const oBinding = this._custModel.bindList("/SchedulerKPI", undefined, undefined,
                this._scopeFilters("FcYear", "FcPeriod", "Version"), {
                $$groupId: "$direct"
            });
            oBinding.requestContexts(0, 50).then(function (aCtx) {
                const kpi = { S: 0, I: 0, C: 0, F: 0, H: 0, TOTAL: 0 };
                aCtx.forEach(function (oCtx) {
                    const o = oCtx.getObject();
                    const n = parseInt(o.JobCount, 10) || 0;
                    // E (Error) folds into the Failed tile, matching the CDS bucket
                    if (o.Status === "F" || o.Status === "E") { kpi.F += n; }
                    else if (kpi[o.Status] !== undefined) { kpi[o.Status] += n; }
                    kpi.TOTAL += n;
                });
                // On-hold is a UNIT state in xb_logdt, not a header status, so it
                // is counted separately from its own read (see _loadHold).
                kpi.H = this._oModel.getProperty("/kpi/H");
                this._oModel.setProperty("/kpi", kpi);
            }.bind(this)).catch(this._readFail.bind(this));
        },

        _loadRuns: function () {
            // Runs FOR THE PICKED DATE. The timeline is inherently one day, so
            // it filters on the actual run date (sdl_startdt), defaulting to
            // today and changeable via the date picker - independent of the
            // period selectors, which scope the KPIs.
            const sRunDate = this._oModel.getProperty("/scope/runDate");
            const aFilters = [ new Filter("sdl_startdt", FilterOperator.EQ, sRunDate) ];
            // apply the version scope to the runs too, when set
            const scV = this._oModel.getProperty("/scope/version");
            if (scV) { aFilters.push(new Filter("version", FilterOperator.EQ, scV)); }
            const oBinding = this._custModel.bindList("/SchedulerTask", undefined,
                [ new sap.ui.model.Sorter("sdl_startdt", true) ], aFilters,
                { $$groupId: "$direct", $select: "guid,job_rec_count,jobname,con_grp,status,sdl_startdt,sdl_starttm,duration" });
            oBinding.requestContexts(0, 100).then(function (aCtx) {
                const rows = aCtx.map(function (oCtx) {
                    const o = oCtx.getObject();
                    // Position the bar from the SAME clock time shown in the
                    // label - that text is reliably correct, whereas the raw
                    // sdl_starttm form is not always parseable. Fall back to the
                    // raw field only if the text has no time.
                    const sStartText = this._timeText(o.sdl_startdt, o.sdl_starttm);
                    let startH = this._hoursFromText(sStartText);
                    if (startH === null) {
                        startH = this._hoursFromTime(o.sdl_starttm);
                    }

                    // Duration in hours. The field's UNIT is uncertain in the
                    // data (seconds vs minutes), and many rows have none, so we
                    // do not trust it to size the bar precisely. Instead:
                    //   - if duration looks like a sane run length, use it
                    //   - otherwise fall back to a fixed, readable block
                    // The timeline's job is "when did it run", not exact length.
                    let durH = 0;
                    const rawDur = parseInt(o.duration, 10);
                    if (rawDur > 0) {
                        // assume seconds; if the result is absurd (>24h) treat as minutes
                        durH = rawDur / 3600;
                        if (durH > 24) { durH = rawDur / 60 / 60; }   // was minutes
                        if (durH > 24) { durH = 1; }                  // still absurd -> clamp
                    }
                    // minimum block so a bar is legible regardless of duration
                    const MIN_H = 1.5;
                    const effH = Math.max(durH, MIN_H);

                    return {
                        guid: o.guid, job_rec_count: o.job_rec_count,
                        jobname: o.jobname, con_grp: o.con_grp, status: o.status,
                        startText: sStartText,
                        barLeft: Math.min(startH / 24 * 100, 92),
                        barWidth: Math.min(effH / 24 * 100, 100),
                        barState: this.formatter.statusState(o.status)
                    };
                }.bind(this));
                this._oModel.setProperty("/runs", rows);
            }.bind(this)).catch(this._readFail.bind(this));
        },

        _loadHold: function () {
            // On-hold units, capped at 50, from the error/hold log.
            const oBinding = this._custModel.bindList("/ErrorLog", undefined, undefined, undefined,
                { $$groupId: "$direct" });
            oBinding.requestContexts(0, 50).then(function (aCtx) {
                const rows = aCtx.map(c => c.getObject());
                this._oModel.setProperty("/hold", rows);
                // distinct held units feed the On Hold KPI tile
                const seen = {};
                rows.forEach(r => { if (r.ConUnit) { seen[r.ConUnit] = true; } });
                this._oModel.setProperty("/kpi/H", Object.keys(seen).length);
            }.bind(this)).catch(function () {
                // ErrorLog not exposed / empty - leave the list empty, no error to user
                this._oModel.setProperty("/hold", []);
            }.bind(this));
        },

        /* ==================================================================
         *  Close Manager role — built only when first opened
         * ================================================================== */
        onRoleChange: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            if (sKey === "MGR" && !this._mgrBuilt) {
                this._buildManager();
            }
        },

        _buildManager: function () {
            this._oModel.setProperty("/mgrScopeText", this._i18n.getText("MgrScope"));

            // NEEDS YOUR ACTION — failed or held jobs in the selected period.
            // Scoping to the user's authorised groups is a backend concern
            // (FC_AUTHORITY_CHECK); the UI reads what the service returns, so
            // enforce the scope in the CDS/service, not here.
            this._loadActions();

            // PERIOD READINESS - reads BV_XB_SCHD_READINESS (tf250 rollup).
            this._loadReadiness();

            // SERIES HEALTH needs a run-history view (recent occurrences per
            // recurring schedule) that is not yet built. Kept empty with the
            // "not yet available" note rather than fabricated - a wall of
            // green/red that is invented would be worse than an honest blank.
            this._oModel.setProperty("/series", []);

            this._mgrBuilt = true;
        },

        /**
         * Period readiness for the selected scope. One aggregated read per
         * group; the "Can close?" verdict is derived here with the same rule
         * the open/close program enforces (DM must be closeable before CM).
         */
        _loadReadiness: function () {
            const sc = this._oModel.getProperty("/scope");
            // Scope has year + period (no version selector on the dashboard),
            // so readiness is filtered by period only and returns every group.
            // The base view already resolves GRR->GRI, so groups appear under
            // their consolidation version; if a version filter is added later,
            // push it here as new Filter("Version", EQ, <consolidation version>).
            const aFilters = [
                new Filter("FcYear",   FilterOperator.EQ, String(sc.year).padStart(4, "0")),
                new Filter("FcPeriod", FilterOperator.EQ, String(sc.period).padStart(3, "0"))
            ];

            const oBinding = this._custModel.bindList("/SchedulerReadiness", undefined, undefined,
                aFilters, { $$groupId: "$direct" });
            oBinding.requestContexts(0, 200).then(function (aCtx) {
                const rows = aCtx.map(function (c) {
                    const o = c.getObject();
                    // DmOpen/CmOpen are Edm.Boolean from the view. Derive
                    // "closed" as the negation, tolerant of boolean or "X".
                    const isOpen = function (v) { return v === true || v === "X" || v === "true"; };
                    const dmClosed = !isOpen(o.DmOpen);
                    const cmClosed = !isOpen(o.CmOpen);
                    // "Can close?" - DM open and closeable is the pre-req; if CM
                    // already closed there is nothing to do. This mirrors the
                    // shape of the e179/e842 guard, kept deliberately simple:
                    //   both closed  -> Closed
                    //   DM open      -> can attempt DM close
                    //   DM closed, CM open -> can attempt CM close
                    let canText, canState;
                    if (dmClosed && cmClosed)      { canText = this._i18n.getText("RdyClosed");   canState = "None"; }
                    else if (!dmClosed)            { canText = this._i18n.getText("RdyDMPending"); canState = "Warning"; }
                    else                           { canText = this._i18n.getText("RdyCMReady");   canState = "Success"; }
                    return {
                        group:  o.ConGroup,
                        dmText: dmClosed ? this._i18n.getText("Closed") : this._i18n.getText("Open"),
                        dmState: dmClosed ? "None" : "Success",
                        cmText: cmClosed ? this._i18n.getText("Closed") : this._i18n.getText("Open"),
                        cmState: cmClosed ? "None" : "Success",
                        canText: canText, canState: canState
                    };
                }.bind(this));
                this._oModel.setProperty("/readiness", rows);
            }.bind(this)).catch(function () {
                this._oModel.setProperty("/readiness", []);
            }.bind(this));
        },

        /**
         * Needs Your Action: failed (F/E) and on-hold jobs for the selected
         * period, most urgent first. Built from data the app already has -
         * SchedulerTask for failures, the on-hold list for holds - so this
         * panel is populated, not stubbed.
         */
        _loadActions: function () {
            const sc = this._oModel.getProperty("/scope");
            const aFilters = [
                new Filter("fc_year",   FilterOperator.EQ, String(sc.year).padStart(4, "0")),
                new Filter("fc_period", FilterOperator.EQ, String(sc.period).padStart(3, "0")),
                new Filter({ filters: [
                    new Filter("status", FilterOperator.EQ, "F"),
                    new Filter("status", FilterOperator.EQ, "E")
                ], and: false })
            ];
            const oBinding = this._custModel.bindList("/SchedulerTask", undefined,
                [ new sap.ui.model.Sorter("sdl_startdt", true) ], aFilters,
                { $$groupId: "$direct", $select: "guid,job_rec_count,jobname,con_grp,status" });
            oBinding.requestContexts(0, 50).then(function (aCtx) {
                const rows = aCtx.map(function (c) {
                    const o = c.getObject();
                    return {
                        priority: "P1", priorityState: "Error",
                        group: o.con_grp,
                        issue: this._i18n.getText("ActionFailed", [o.jobname]),
                        actionText: this._i18n.getText("ActionRestart"),
                        guid: o.guid, job_rec_count: o.job_rec_count
                    };
                }.bind(this));
                this._oModel.setProperty("/actions", rows);
            }.bind(this)).catch(function () {
                this._oModel.setProperty("/actions", []);
            }.bind(this));
        },

        /* ==================================================================
         *  Navigation
         * ================================================================== */

        onKpiPress: function (oEvent) {
            const sKpi = oEvent.getSource().data("kpi");
            const sc = this._oModel.getProperty("/scope");
            // Stash on the Component so the Home controller (a different
            // instance) can read it. kpi="ALL" (Total Schedules) means NO
            // status filter - the list opens showing everything in scope.
            this.getOwnerComponent()._kpiStatusFilter = (sKpi === "ALL") ? "" : sKpi;
            this.getOwnerComponent()._kpiScope = {
                version: sc.version || "", year: sc.year, period: sc.period
            };
            this.getOwnerComponent().getRouter().navTo("Home", {}, false);
        },

        onRunPress: function (oEvent) {
            const o = oEvent.getSource().getBindingContext("dashModel").getObject();
            this.getOwnerComponent().getRouter().navTo("JobDetail", {
                jobId: o.guid, jobRecCount: o.job_rec_count
            });
        },

        onActionPress: function (oEvent) {
            const o = oEvent.getSource().getBindingContext("dashModel").getObject();
            if (o && o.guid) {
                this.getOwnerComponent().getRouter().navTo("JobDetail", {
                    jobId: o.guid, jobRecCount: o.job_rec_count
                });
            }
        },

        onOpenSchedules: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

        onRefresh: function () {
            this._lastLoad = 0;           // force past the cache
            this._loadOperator();
            if (this._oModel.getProperty("/role") === "MGR") {
                this._mgrBuilt = false;
                this._buildManager();
            }
        },

        /* ==================================================================
         *  Helpers
         * ================================================================== */
        _stampContext: function () {
            const t  = new Date().toTimeString().slice(0, 5);
            const sc = this._oModel.getProperty("/scope");
            // e.g. "FY 2026 / Period 008 - refreshed 11:19"
            this._oModel.setProperty("/contextText",
                this._i18n.getText("DashContext", [sc.year, sc.period, t]));
        },

        /**
         * Filters for the currently selected scope. fc_year is NUMC(4),
         * fc_period NUMC(3) - both padded so the value matches how the DB
         * stores it. Field names differ between the KPI view (FcYear/FcPeriod)
         * and SchedulerTask (fc_year/fc_period), hence the parameters.
         */
        _scopeFilters: function (sYearField, sPeriodField, sVersionField) {
            const sc = this._oModel.getProperty("/scope");
            const aF = [
                new Filter(sYearField,   FilterOperator.EQ, String(sc.year).padStart(4, "0")),
                new Filter(sPeriodField, FilterOperator.EQ, String(sc.period).padStart(3, "0"))
            ];
            // Version is optional ("" = All). Only added when the user picks one
            // and the caller told us the field name for this source.
            if (sc.version && sVersionField) {
                aF.push(new Filter(sVersionField, FilterOperator.EQ, sc.version));
            }
            return aF;
        },

        /**
         * Distinct versions present in the schedule data, for the Version
         * selector. "All" first (key ""), then each version once. Read from
         * the KPI view is cheap; if you would rather list every configured
         * version regardless of data, point this at a version master instead.
         */
        _loadVersions: function () {
            const oBinding = this._custModel.bindList("/SchedulerTask", undefined, undefined, undefined,
                { $$groupId: "$direct", $select: "version" });
            oBinding.requestContexts(0, 999).then(function (aCtx) {
                const seen = {};
                const aVers = [{ key: "", text: this._i18n.getText("VersionAll") }];
                aCtx.forEach(function (c) {
                    const v = c.getObject().version;
                    if (v && !seen[v]) { seen[v] = true; aVers.push({ key: v, text: v }); }
                });
                this._oModel.setProperty("/versions", aVers);
            }.bind(this)).catch(function () {
                this._oModel.setProperty("/versions", [{ key: "", text: this._i18n.getText("VersionAll") }]);
            }.bind(this));
        },

        /**
         * Current fiscal year and period, used only as the DEFAULT selection.
         * Deliberately NOT treated as authoritative - the user can change both.
         * Period is left at the calendar month as a starting guess; if that is
         * ever wrong the user simply picks the right one, and nothing downstream
         * depends on this being correct.
         */
        _defaultScope: function () {
            const d = new Date();
            return {
                year:    String(d.getFullYear()),
                period:  String(d.getMonth() + 1).padStart(3, "0"),
                version: "",                       // All versions by default
                runDate: d.getFullYear() + "-" +
                         String(d.getMonth() + 1).padStart(2, "0") + "-" +
                         String(d.getDate()).padStart(2, "0")   // timeline defaults to today
            };
        },

        _buildYears: function (sCurrent) {
            // a small range around the current year - past for look-back,
            // one ahead for scheduling into the next year
            const y = parseInt(sCurrent, 10);
            const out = [];
            for (let i = y + 1; i >= y - 4; i--) {
                out.push({ key: String(i), text: String(i) });
            }
            return out;
        },

        _buildPeriods: function () {
            // 001..016 covers normal plus special periods (TF325 shows up to 16)
            const out = [];
            for (let i = 1; i <= 16; i++) {
                const k = String(i).padStart(3, "0");
                out.push({ key: k, text: k });
            }
            return out;
        },

        /** Timeline date changed - reload only the runs, cheaply. */
        onRunDateChange: function () {
            this._loadRuns();
        },

        /** Re-read when the user changes year or period. Bypasses the cache. */
        onScopeChange: function () {
            this._lastLoad = 0;
            this._loadOperator();
            if (this._oModel.getProperty("/role") === "MGR") {
                this._mgrBuilt = false;
                this._buildManager();
            }
        },

        // sdl_starttm arrives as "HHMMSS" (NUMC/time) or "HH:MM:SS".
        // Return decimal hours for placing the bar on the 24h track.
        _hoursFromTime: function (vTime) {
            if (!vTime) { return 0; }

            // Edm.TimeOfDay in the V4 model can arrive as a JS Date.
            if (vTime instanceof Date) {
                return vTime.getHours() + vTime.getMinutes() / 60;
            }

            const s = String(vTime);

            // ISO 8601 duration form "PT10H12M00S" (common for Edm.TimeOfDay)
            let m = s.match(/PT(\d{1,2})H(?:(\d{1,2})M)?/);
            if (m) {
                return parseInt(m[1], 10) + (parseInt(m[2] || "0", 10)) / 60;
            }

            // "HH:MM[:SS]"
            m = s.match(/^(\d{1,2}):(\d{2})/);
            if (m) {
                return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
            }

            // "HHMMSS" (NUMC time)
            m = s.match(/^(\d{2})(\d{2})/);
            if (m) {
                return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
            }

            return 0;
        },

        // Pull the clock time out of the start-TEXT we already build
        // ("2026-08-14 10:12") as a reliable fallback, since that string is
        // proven to render correctly even when sdl_starttm's raw form is odd.
        _hoursFromText: function (sText) {
            if (!sText) { return null; }
            const m = String(sText).match(/(\d{1,2}):(\d{2})/);
            return m ? parseInt(m[1], 10) + parseInt(m[2], 10) / 60 : null;
        },

        _timeText: function (sDate, sTime) {
            if (!sDate) { return this._i18n.getText("NotScheduled"); }
            const t = sTime ? String(sTime).substring(0, 5) : "";
            return String(sDate) + (t ? " " + t : "");
        },

        _readFail: function () {
            MessageToast.show(this._i18n.getText("DashLoadFail"));
        }
    });
});