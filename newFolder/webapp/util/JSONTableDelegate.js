sap.ui.define([
    "sap/ui/mdc/TableDelegate",
    "sap/ui/model/Sorter"
], function (TableDelegate, Sorter) {
    "use strict";

    /**
     * Delegate for the Home view sap.ui.mdc.Table, backed by a JSONModel.
     *
     * fetchProperties() describes each column property so MDC can drive the
     * Sort and Column personalisation panels. Every name here must match the
     * propertyKey set on the corresponding sap.ui.mdc.Column in the view.
     *
     * updateBindingInfo() pins the binding path to jobModel>/results and
     * applies the same default sort order as the original sap.ui.table.Table.
     *
     * filterable: false on every property – filtering is handled by the
     * FilterBar; the table does not apply its own column filters.
     */
    const JSONTableDelegate = Object.assign({}, TableDelegate);

    JSONTableDelegate.fetchProperties = function (/* oTable */) {
        return Promise.resolve([
            { name: "status",          label: "Status",             dataType: "sap.ui.model.type.String", sortable: true, filterable: false },
            { name: "jobname",         label: "Job Name",           dataType: "sap.ui.model.type.String", sortable: true, filterable: false },
            { name: "version",         label: "Version",            dataType: "sap.ui.model.type.String", sortable: true, filterable: false },
            { name: "task_type",       label: "Task Type",          dataType: "sap.ui.model.type.String", sortable: true, filterable: false },
            { name: "fc_year",         label: "Fiscal Year/Period", dataType: "sap.ui.model.type.String", sortable: true, filterable: false },
            { name: "con_grp",         label: "Cons. Group",        dataType: "sap.ui.model.type.String", sortable: true, filterable: false },
            { name: "sdl_startdt",     label: "Planned Start",      dataType: "sap.ui.model.type.String", sortable: true, filterable: false },
            { name: "enddate",         label: "End",                dataType: "sap.ui.model.type.String", sortable: true, filterable: false },
            { name: "duration",        label: "Duration",           dataType: "sap.ui.model.type.String", sortable: true, filterable: false },
            { name: "generic_user_id", label: "Created By",         dataType: "sap.ui.model.type.String", sortable: true, filterable: false },
            { name: "createdby",       label: "Created By (User)",  dataType: "sap.ui.model.type.String", sortable: true, filterable: false, visible: false },
            { name: "creation_date",   label: "Created On",         dataType: "sap.ui.model.type.String", sortable: true, filterable: false }
        ]);
    };

    JSONTableDelegate.updateBindingInfo = function (oTable, oBindingInfo) {
        oBindingInfo.path = "jobModel>/results";
        oBindingInfo.sorter = [
            new Sorter("sdl_startdt", true),
            new Sorter("sdl_starttm", true),
            new Sorter("jobname",     true),
            new Sorter("createdby",   true)
        ];
    };

    return JSONTableDelegate;
});
