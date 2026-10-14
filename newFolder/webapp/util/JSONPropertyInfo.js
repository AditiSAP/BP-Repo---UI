sap.ui.define([], function () {
    "use strict";

    return [
        { name: "status",          label: "Status",             dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "jobname",         label: "Job Name",           dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { name: "version",         label: "Version",            dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { name: "task_type",       label: "Task Type",          dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "fc_year",         label: "Fiscal Year/Period", dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "con_grp",         label: "Cons. Group",        dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "sdl_startdt",     label: "Planned Start",      dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { name: "enddate",         label: "End",                dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { name: "duration",        label: "Duration",           dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false },
        { name: "generic_user_id", label: "Created By",         dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true  },
        { name: "createdby",       label: "Created By (User)",  dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: true,  visible: false },
        { name: "creation_date",   label: "Created On",         dataType: "sap.ui.model.type.String", sortable: true, filterable: true,  groupable: false }
    ];
}, false);
