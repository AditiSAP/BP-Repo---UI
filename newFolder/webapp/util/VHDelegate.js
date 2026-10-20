sap.ui.define([
    "sap/ui/mdc/ValueHelpDelegate",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (ValueHelpDelegate, Filter, FilterOperator) {
    "use strict";

    var VHDelegate = Object.assign({}, ValueHelpDelegate);

    VHDelegate.isSearchSupported = function (oValueHelp, oContent) {
        return !!oValueHelp.getPayload().filterField;
    };

    VHDelegate.executeSearch = function (oValueHelp, oContent, sSearch) {
        var sField       = oValueHelp.getPayload().filterField;
        var oListBinding = oContent.getListBinding && oContent.getListBinding();
        if (oListBinding) {
            oListBinding.filter(
                sSearch && sField
                    ? [new Filter(sField, FilterOperator.Contains, sSearch)]
                    : []
            );
        }
        return Promise.resolve();
    };

    return VHDelegate;
});
