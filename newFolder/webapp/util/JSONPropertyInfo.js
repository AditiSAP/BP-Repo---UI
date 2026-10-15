sap.ui.define([], function () {
    "use strict";

    // Property info follows the SAP MDC standard sample pattern.
    // Only 'name' is used as the identifier (not 'key') — MDC's PropertyHelper
    // rejects unknown attributes, and 'key' is not in its allowed schema.
    return [
        { name: "status",          path: "status",          label: "Status",             dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "jobname",         path: "jobname",         label: "Job Name",           dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { name: "version",         path: "version",         label: "Version",            dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { name: "task_type",       path: "task_type",       label: "Task Type",          dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "fc_year",         path: "fc_year",         label: "Fiscal Year/Period", dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "con_grp",         path: "con_grp",         label: "Cons. Group",        dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "sdl_startdt",     path: "sdl_startdt",     label: "Planned Start",      dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { name: "enddate",         path: "enddate",         label: "End",                dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { name: "duration",        path: "duration",        label: "Duration",           dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { name: "generic_user_id", path: "generic_user_id", label: "Created By",         dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "createdby",       path: "createdby",       label: "Created By (User)",  dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true,  visible: false },
        { name: "creation_date",   path: "creation_date",   label: "Created On",         dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false }
    ];
}, false);
