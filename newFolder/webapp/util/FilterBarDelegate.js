sap.ui.define([
    "sap/ui/mdc/FilterBarDelegate"
], function (FilterBarDelegate) {
    "use strict";

    /**
     * Delegate for the Home view sap.ui.mdc.FilterBar.
     *
     * fetchProperties() returns property metadata that MDC uses to manage
     * the internal condition model. Every name here must match the
     * propertyKey on the corresponding sap.ui.mdc.FilterField in the view.
     *
     * The controller reads active conditions via oFilterBar.getConditions()
     * and converts them to sap.ui.model.Filter objects in createFilters().
     */
    const FilterBarDelegateImpl = Object.assign({}, FilterBarDelegate);

    FilterBarDelegateImpl.fetchProperties = function (/* oFilterBar */) {
        return Promise.resolve([
            {
                name: "jobname",
                label: "Job Name",
                dataType: "sap.ui.model.type.String",
                maxConditions: 1
            },
            {
                name: "dateRange",
                label: "Date",
                // DateTimeOffset gives MDC the full date+time picker for the BT operator
                dataType: "sap.ui.model.odata.type.DateTimeOffset",
                maxConditions: 1,
                required: true
            },
            {
                name: "createdby",
                label: "Created By",
                dataType: "sap.ui.model.type.String",
                maxConditions: 1
            },
            {
                name: "status",
                label: "Status",
                dataType: "sap.ui.model.type.String",
                // -1 = unlimited selections – mirrors the original MultiComboBox
                maxConditions: -1
            },
            {
                name: "fcYear",
                label: "Fiscal Year",
                dataType: "sap.ui.model.type.String",
                maxConditions: 1,
                constraints: { maxLength: 4 }
            },
            {
                name: "fcPeriod",
                label: "Period",
                dataType: "sap.ui.model.type.String",
                maxConditions: 1,
                constraints: { maxLength: 3 }
            }
        ]);
    };

    return FilterBarDelegateImpl;
});
