sap.ui.define([
    "sap/ui/mdc/TableDelegate",
    "sap/ui/mdc/table/Column",
    "sap/m/Text",
    "sap/m/ObjectStatus",
    "sap/ui/model/Sorter",
    "com/bpcfn/jobscheduler/util/JSONPropertyInfo",
    "com/bpcfn/jobscheduler/util/JSONTableFilterDelegate",
    "com/bpcfn/jobscheduler/model/formatter"
], function (TableDelegate, Column, Text, ObjectStatus, Sorter, JSONPropertyInfo, JSONTableFilterDelegate, Formatter) {
    "use strict";

    const JSONTableDelegate = Object.assign({}, TableDelegate);

    JSONTableDelegate.fetchProperties = async function () {
        return JSONPropertyInfo.filter(function (oPI) { return oPI.key !== "$search"; });
    };

    JSONTableDelegate.getFilterDelegate = function () {
        return JSONTableFilterDelegate;
    };

    // Creates a fresh column instance for a given property key.
    // Called by addItem whenever MDC needs to (re-)add a column.
    function _createColumn(sId, sKey) {
        switch (sKey) {
            case "status":
                return new Column(sId, {
                    propertyKey: "status",
                    header: "{i18n>Status}",
                    width: "7rem",
                    template: new ObjectStatus({
                        text:  { path: "jobModel>status", formatter: Formatter.statusText },
                        state: { path: "jobModel>status", formatter: Formatter.statusState }
                    })
                });

            case "jobname":
                return new Column(sId, {
                    propertyKey: "jobname",
                    header: "{i18n>JobName}",
                    template: new Text({ text: "{jobModel>jobname}", wrapping: false })
                });

            case "version":
                return new Column(sId, {
                    propertyKey: "version",
                    header: "{i18n>Version}",
                    width: "7rem",
                    template: new Text({ text: "{jobModel>version}", wrapping: false })
                });

            case "task_type":
                return new Column(sId, {
                    propertyKey: "task_type",
                    header: "{i18n>TaskType}",
                    width: "7rem",
                    template: new Text({
                        text: { path: "jobModel>task_type", formatter: Formatter.taskTypeText },
                        wrapping: false
                    })
                });

            case "fc_year":
                return new Column(sId, {
                    propertyKey: "fc_year",
                    header: "{i18n>FiscalYearPeriod}",
                    width: "9rem",
                    template: new Text({
                        text: {
                            parts: [{ path: "jobModel>fc_year" }, { path: "jobModel>fc_period" }],
                            formatter: Formatter.fiscalYearPeriod
                        },
                        wrapping: false
                    })
                });

            case "con_grp":
                return new Column(sId, {
                    propertyKey: "con_grp",
                    header: "{i18n>ConsGroup}",
                    width: "8rem",
                    template: new Text({ text: "{jobModel>con_grp}", wrapping: false })
                });

            case "sdl_startdt":
                return new Column(sId, {
                    propertyKey: "sdl_startdt",
                    header: "{i18n>PlannedStart}",
                    width: "12rem",
                    template: new Text({
                        text: {
                            parts: [{ path: "jobModel>sdl_startdt" }, { path: "jobModel>sdl_starttm" }],
                            formatter: Formatter.formatDateTime
                        }
                    })
                });

            case "enddate":
                return new Column(sId, {
                    propertyKey: "enddate",
                    header: "{i18n>End}",
                    width: "12rem",
                    template: new Text({
                        text: {
                            parts: [{ path: "jobModel>enddate" }, { path: "jobModel>endtime" }],
                            formatter: Formatter.formatDateTime
                        }
                    })
                });

            case "duration":
                return new Column(sId, {
                    propertyKey: "duration",
                    header: "{i18n>Duration}",
                    width: "8rem",
                    template: new Text({ text: "{jobModel>duration}" })
                });

            case "generic_user_id":
                return new Column(sId, {
                    propertyKey: "generic_user_id",
                    header: "{i18n>CreatedBy}",
                    width: "7rem",
                    template: new Text({
                        text: {
                            parts: [
                                { path: "jobModel>generic_user_id" },
                                { path: "jobModel>createdby" }
                            ],
                            formatter: function (sGenericUser, sCreatedBy) {
                                return sGenericUser || sCreatedBy || "";
                            }
                        },
                        wrapping: false
                    })
                });

            case "createdby":
                return new Column(sId, {
                    propertyKey: "createdby",
                    header: "{i18n>CreatedBy}",
                    width: "7rem",
                    template: new Text({ text: "{jobModel>createdby}", wrapping: false })
                });

            case "creation_date":
                return new Column(sId, {
                    propertyKey: "creation_date",
                    header: "{i18n>CreatedOn}",
                    width: "12rem",
                    template: new Text({
                        text: {
                            parts: [{ path: "jobModel>creation_date" }, { path: "jobModel>creation_time" }],
                            formatter: Formatter.formatDateTime
                        }
                    })
                });

            default:
                return null;
        }
    }

    // Standard MDC pattern: create a fresh column instance per property key.
    // The ID convention oTable.getId() + "---col-" + key matches the SAP demo-kit
    // standard and guarantees a stable, unique ID for each delegate-created column.
    JSONTableDelegate.addItem = async function (oTable, sPropertyKey) {
        const sKey = (sPropertyKey && typeof sPropertyKey === "object")
            ? (sPropertyKey.key || sPropertyKey.name) : sPropertyKey;
        const sId = oTable.getId() + "---col-" + sKey;
        const oColumn = _createColumn(sId, sKey);
        if (oColumn) {
            return oColumn;
        }
        return TableDelegate.addItem.call(this, oTable, sPropertyKey);
    };

    JSONTableDelegate.updateBindingInfo = function (oTable, oBindingInfo) {
        TableDelegate.updateBindingInfo.call(JSONTableDelegate, oTable, oBindingInfo);
        oBindingInfo.path = oTable.getPayload().bindingPath;
        // Apply default sort only when no P13n-driven sorters are present.
        if (!oBindingInfo.sorter || !oBindingInfo.sorter.length) {
            oBindingInfo.sorter = [
                new Sorter("sdl_startdt", true),
                new Sorter("sdl_starttm", true),
                new Sorter("jobname",     true),
                new Sorter("createdby",   true)
            ];
        }
    };

    return JSONTableDelegate;
});
