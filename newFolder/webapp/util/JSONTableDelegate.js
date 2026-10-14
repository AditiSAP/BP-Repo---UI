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

    // propertyKey → view-local ID for every column defined in Home.view.xml
    var _mColIds = {
        "status":          "colStatus",
        "jobname":         "colJobname",
        "version":         "colVersion",
        "task_type":       "colTaskType",
        "fc_year":         "colFcYear",
        "con_grp":         "colConGrp",
        "sdl_startdt":     "colSdlStart",
        "enddate":         "colEnddate",
        "duration":        "colDuration",
        "generic_user_id": "colGenericUser",
        "createdby":       "colCreatedby",
        "creation_date":   "colCreationDate"
    };

    // Walk up from oControl until we reach an ancestor that exposes byId()
    // (sap.ui.core.mvc.View does; so does UIComponent as a fallback).
    function _findInView(oControl, sLocalId) {
        var oAncestor = oControl;
        while (oAncestor) {
            if (typeof oAncestor.byId === "function") {
                var oFound = oAncestor.byId(sLocalId);
                if (oFound) { return oFound; }
            }
            oAncestor = typeof oAncestor.getParent === "function"
                ? oAncestor.getParent() : null;
        }
        return null;
    }

    // Ensure oTable._oAllCols contains a reference to every column ever seen.
    // Called by removeItem – snapshotting the full aggregation on the FIRST call
    // so addItem can always recover the original column with its custom template,
    // regardless of whether the column was removed by our own delegate or
    // directly by the fl change handler during variant switching.
    function _ensureColMap(oTable, oColumn) {
        if (!oTable._oAllCols) {
            oTable._oAllCols = {};
            oTable.getColumns().forEach(function (oCol) {
                oTable._oAllCols[oCol.getPropertyKey()] = oCol;
            });
        }
        // Also record the column being removed (covers the case where it was
        // already detached before the snapshot above ran).
        if (oColumn) {
            oTable._oAllCols[oColumn.getPropertyKey()] = oColumn;
        }
    }

    JSONTableDelegate.removeItem = function (oTable, oColumn /*, mPropertyBag */) {
        oTable.removeColumn(oColumn); // detach without destroying
        return Promise.resolve(true);
    };

    JSONTableDelegate.addItem = function (oTable, sPropertyKey /*, mPropertyBag */) {
        // Some MDC versions pass an object {name:...} instead of a plain string.
        var sKey = (sPropertyKey && typeof sPropertyKey === "object")
            ? sPropertyKey.name : sPropertyKey;

        var sLocalId = _mColIds[sKey];
        if (!sLocalId) {
            /* eslint-disable no-console */
            console.error("[JSONTableDelegate.addItem] no _mColIds entry for key:", sKey, "| raw sPropertyKey:", sPropertyKey);
            /* eslint-enable no-console */
            return TableDelegate.addItem.apply(this, arguments);
        }

        // Approach 1: derive full element ID from the table's own ID.
        // Table ID format: "<viewPrefix>--<localTableId>"; column ID: "<viewPrefix>--<localColId>"
        var sTableId = oTable && oTable.getId ? oTable.getId() : "";
        var iSep = sTableId.lastIndexOf("--");
        var sFullId = iSep >= 0 ? sTableId.substring(0, iSep + 2) + sLocalId : "";

        var ElementCls = sap.ui.require("sap/ui/core/Element");
        var oColumn = sFullId
            ? (ElementCls ? ElementCls.getElementById(sFullId) : sap.ui.getCore().byId(sFullId))
            : null;

        // Approach 2: walk parent chain to the View and call byId.
        if (!oColumn) {
            var oView = oTable;
            while (oView && !(oView.isA && oView.isA("sap.ui.core.mvc.View"))) {
                oView = typeof oView.getParent === "function" ? oView.getParent() : null;
            }
            oColumn = oView ? oView.byId(sLocalId) : null;
        }

        /* eslint-disable no-console */
        console.log("[JSONTableDelegate.addItem] key:", sKey, "| sFullId:", sFullId,
            "| found:", !!(oColumn), "| destroyed:", !!(oColumn && oColumn.bIsDestroyed),
            "| tableId:", sTableId);
        /* eslint-enable no-console */

        if (!oColumn || oColumn.bIsDestroyed) {
            return TableDelegate.addItem.apply(this, arguments);
        }

        // Detach from current parent first so MDC's insertColumn does not throw.
        var oParent = oColumn.getParent && oColumn.getParent();
        if (oParent && typeof oParent.removeColumn === "function") {
            oParent.removeColumn(oColumn);
        }
        return Promise.resolve(oColumn);
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
