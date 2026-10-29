sap.ui.define([], function () {
    "use strict";

    // Property info follows the SAP MDC standard sample pattern.
    // Only 'name' is used as the identifier (not 'key') — MDC's PropertyHelper
    // rejects unknown attributes, and 'key' is not in its allowed schema.
    return [
        { name: "status",          path: "status",          label: "Status",             groupLabel: "Status",             dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "jobname",         path: "jobname",         label: "Job Name",           groupLabel: "Job Name",           dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "version",         path: "version",         label: "Version",            groupLabel: "Version",            dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "task_type",       path: "task_type",       label: "Task Type",          groupLabel: "Task Type",          dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "fc_year",         path: "fc_year",         label: "Fiscal Year/Period", groupLabel: "Fiscal Year/Period", dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "con_grp",         path: "con_grp",         label: "Cons. Group",        groupLabel: "Cons. Group",        dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "sdl_startdt",     path: "sdl_startdt",     label: "Planned Start",      groupLabel: "Planned Start",      dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "enddate",         path: "enddate",         label: "End",                groupLabel: "End",                dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "duration",        path: "duration",        label: "Duration",           groupLabel: "Duration",           dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "generic_user_id", path: "generic_user_id", label: "Created By",         groupLabel: "Created By",         dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "createdby",       path: "createdby",       label: "Created By (User)",  groupLabel: "Created By (User)",  dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true,  visible: false },
        { name: "creation_date",   path: "creation_date",   label: "Created On",         groupLabel: "Created On",         dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  }
    ];
}, false);
