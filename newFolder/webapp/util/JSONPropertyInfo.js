sap.ui.define([], function () {
    "use strict";

    // Property info follows the SAP MDC standard sample pattern:
    // - key  : identifier used by MDC internally (Filter/Sort/Group panels)
    // - name : same value – required by sap.ui.mdc.TableDelegate.fetchProperties
    // - path : data-binding path on the JSONModel item (defaults to key when omitted)
    return [
        { key: "status",          name: "status",          path: "status",          label: "Status",             dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { key: "jobname",         name: "jobname",         path: "jobname",         label: "Job Name",           dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { key: "version",         name: "version",         path: "version",         label: "Version",            dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { key: "task_type",       name: "task_type",       path: "task_type",       label: "Task Type",          dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { key: "fc_year",         name: "fc_year",         path: "fc_year",         label: "Fiscal Year/Period", dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { key: "con_grp",         name: "con_grp",         path: "con_grp",         label: "Cons. Group",        dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { key: "sdl_startdt",     name: "sdl_startdt",     path: "sdl_startdt",     label: "Planned Start",      dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { key: "enddate",         name: "enddate",         path: "enddate",         label: "End",                dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { key: "duration",        name: "duration",        path: "duration",        label: "Duration",           dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { key: "generic_user_id", name: "generic_user_id", path: "generic_user_id", label: "Created By",         dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { key: "createdby",       name: "createdby",       path: "createdby",       label: "Created By (User)",  dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true,  visible: false },
        { key: "creation_date",   name: "creation_date",   path: "creation_date",   label: "Created On",         dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false }
    ];
}, false);
