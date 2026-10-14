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
            { name: "status",          label: "Status",             dataType: "sap.ui.model.type.String", sortable: true, filterable: true },
            { name: "jobname",         label: "Job Name",           dataType: "sap.ui.model.type.String", sortable: true, filterable: true },
            { name: "version",         label: "Version",            dataType: "sap.ui.model.type.String", sortable: true, filterable: true },
            { name: "task_type",       label: "Task Type",          dataType: "sap.ui.model.type.String", sortable: true, filterable: true },
            { name: "fc_year",         label: "Fiscal Year/Period", dataType: "sap.ui.model.type.String", sortable: true, filterable: true },
            { name: "con_grp",         label: "Cons. Group",        dataType: "sap.ui.model.type.String", sortable: true, filterable: true },
            { name: "sdl_startdt",     label: "Planned Start",      dataType: "sap.ui.model.type.String", sortable: true, filterable: true },
            { name: "enddate",         label: "End",                dataType: "sap.ui.model.type.String", sortable: true, filterable: true },
            { name: "duration",        label: "Duration",           dataType: "sap.ui.model.type.String", sortable: true, filterable: true },
            { name: "generic_user_id", label: "Created By",         dataType: "sap.ui.model.type.String", sortable: true, filterable: true },
            { name: "createdby",       label: "Created By (User)",  dataType: "sap.ui.model.type.String", sortable: true, filterable: true, visible: false },
            { name: "creation_date",   label: "Created On",         dataType: "sap.ui.model.type.String", sortable: true, filterable: true }
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
        _ensureColMap(oTable, oColumn);
        oTable.removeColumn(oColumn); // detach WITHOUT destroying
        return Promise.resolve(true);
    };

    JSONTableDelegate.addItem = function (oTable, sPropertyKey /*, mPropertyBag */) {
        var oColumn = null;

        // Primary: use the snapshot map built when columns were first removed.
        // Skip any entry that was destroyed (e.g. by a variant-management reset).
        if (oTable._oAllCols && oTable._oAllCols[sPropertyKey]) {
            var oCached = oTable._oAllCols[sPropertyKey];
            if (!oCached.bIsDestroyed) {
                oColumn = oCached;
            } else {
                delete oTable._oAllCols[sPropertyKey];
            }
        }

        // Fallback: the fl layer may have bypassed removeItem (variant switching)
        // so the map was never built. Find the column by its stable view-local ID.
        if (!oColumn) {
            var sLocalId = _mColIds[sPropertyKey];
            if (sLocalId) {
                oColumn = _findInView(oTable, sLocalId);

                // _findInView only walks the live view tree; a detached column won't
                // be found there. Look it up via the core registry using createId().
                if (!oColumn) {
                    var oAncestor = oTable;
                    while (oAncestor && typeof oAncestor.createId !== "function") {
                        oAncestor = typeof oAncestor.getParent === "function"
                            ? oAncestor.getParent() : null;
                    }
                    if (oAncestor) {
                        oColumn = sap.ui.getCore().byId(oAncestor.createId(sLocalId));
                    }
                }

                if (oColumn) {
                    if (!oTable._oAllCols) { oTable._oAllCols = {}; }
                    oTable._oAllCols[sPropertyKey] = oColumn;
                }
            }
        }

        if (oColumn) {
            // MDC Table calls insertColumn() on the returned column. If the column
            // still has a parent (e.g. Reset calls addItem for columns already in
            // the table without a preceding removeItem), UI5 aggregation throws and
            // breaks the p13n state machine. Detach first to prevent that.
            var oParent = oColumn.getParent && oColumn.getParent();
            if (oParent && typeof oParent.removeColumn === "function") {
                oParent.removeColumn(oColumn);
            }
            return Promise.resolve(oColumn);
        }

        return TableDelegate.addItem.apply(this, arguments);
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
