sap.ui.define([
    "sap/ui/core/date/UI5Date",
], function (UI5Date) {
    "use strict";

    return {
        statusState: function (sStatus) {
            switch (sStatus) {
                case "Finished":
                    return "Success";
                case "Failed":
                    return "Error";
                case "User Error":
                    return "Error";
                case "In Process":
                    return "Warning";
                case "Canceling":
                    return "Warning";
                case "Canceled":
                    return "Information";
                case "Skipped":
                    return "None";
                case "Scheduled":
                    return "Information";
                case "Ready":
                    return "Information";
                default:
                    return "None";
            }
        },
        taskType: function (index) {
            switch (index) {
                case "DM":
                    return 0;
                case "CM":
                    return 1;
            }
        },
        recurrence: function (value) {
            switch (value) {
                case "":
                    return "Single Run";
                case "MI":
                    return "Minutes";
                case "H":
                    return "Hours";
                case "D":
                    return "Daily";
                case "W":
                    return "Weekly";
                default:
                    return "";
            }
        },
        recurrenceText: function (rec, value) {
            switch (rec) {
                case "":
                    return "Single Run";
                case "MI":
                    return "Repeat Job Every " + value + " Minute(s)";
                case "H":
                    return "Repeat Job Every " + value + " Hour(s)";
                case "D":
                    return "Repeat Job Every " + value + " Day(s)";
                case "W":
                    return "Repeat Job Every " + value + " Week(s)";
                default:
                    return "Single Run";
            }
        },
        endByText: function (end, time, occ) {
            switch (end) {
                case "":
                    return "No End Date Defined";
                case "DATE":
                    return "By " + time;
                case "NUM":
                    return "After " + occ + " Occurrence(s)";
                default:
                    return "";
            }
        },
        blockUnblock: function (status) {
            switch (status) {
                case "BLK":
                    return "Block";
                case "BUR":
                    return "Block Upon User Request";
                case "UBK":
                    return "Un Block";
                default:
                    return "None";
            }
        },
        everyLabel: function (key) {
            switch (key) {
                case "MI":
                    return "Minute(s)";
                case "H":
                    return "Hour(s)";
                case "D":
                    return "Day(s)";
                case "W":
                    return "Week(s)";
                case "MO":
                    return "Month(s)";
                default:
                    return "";
            }
        },
        everyEndFieldVisible: function (key) {
            return ["MI", "H", "D", "W", "MO"].includes(key);
        },
        showOnField: function (sPrdDays) {
            return ["W", "MO"].includes(sPrdDays);
        },
        showOnMonths: function (sPrdDays) {
            return sPrdDays === "MO";
        },
        runEndVisible: function (runEnd, visible) {
            const runEndVisible = runEnd ?? false;
            const tVisible = visible ?? false;
            return runEndVisible && tVisible;
        },
        byEndByVisible: function (rec, key) {
            return String(key) === "DATE" && String(rec) !== ""; // Only visible for case 2
        },
        byEndByVisibleConverted: function (rec, key, visible) {
            return String(key) === "DATE" && String(rec) !== "" && visible;
        },
        byOccurenceVisible: function (rec, key) {
            return String(key) === "NUM" && String(rec) !== ""; // Only visible for case 3
        },
        addTimeToIso: function (iso, options = {}, UtcSign, reverse) {
            const dt = new Date(iso);
            const msToAdd =
                (options.ms || 0) +
                (options.seconds || 0) * 1000 +
                (options.minutes || 0) * 60 * 1000 +
                (options.hours || 0) * 60 * 60 * 1000 +
                (options.days || 0) * 24 * 60 * 60 * 1000;

            const result = new Date(this.calculateTimeDiff(dt.getTime(), msToAdd, UtcSign, reverse));

            const pad = n => String(n).padStart(2, "0");
            const yyyy = result.getFullYear();
            const mm = pad(result.getMonth() + 1);
            const dd = pad(result.getDate());
            const hh = pad(result.getHours());
            const mi = pad(result.getMinutes());
            const ss = pad(result.getSeconds());
            return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
        },
        calculateTimeDiff: function (a, b, operator, reverse) {
            const now = new Date();
            const offsetMinutes = now.getTimezoneOffset(); // e.g., IST => -330
            const offsetMs = -offsetMinutes * 60000; // conversion from minutes to milliseconds

            if (reverse) {
                switch (operator) {
                    case '+': return a - (offsetMs - b);
                    case '-': return a - (offsetMs + b);
                    default: throw new Error('Invalid operator');
                }
            } else {
                switch (operator) {
                    case '+': return a + (offsetMs - b);
                    case '-': return a + (offsetMs + b);
                    default: throw new Error('Invalid operator');
                }
            }
        },
        // Example: "2025-12-02" , "04:15:14" to "2025-12-02, 09:45:14"
        reverseDateTime: function (sDate, sTime) {
            if (!sDate || !sTime) {
                return "";
            }
            // Combine date and time into ISO format
            const sISODateTime = `${sDate}T${sTime}Z`;
            // Create UI5 Date instance
            const oDate = UI5Date.getInstance(new Date(sISODateTime));

            var oDateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
                pattern: "dd.MM.yyyy, HH:mm:ss"
            });

            return oDateFormat.format(oDate);
        },
        // Example: "2025-12-02" , "04:15:14" to "Tue Dec 02 2025 09:45:14"
        formatDateTime: function (sDate, sTime) {
            if (!sDate || !sTime) {
                return "";
            }
            // Combine date and time into ISO format
            const sISODateTime = `${sDate}T${sTime}Z`;
            // Create UI5 Date instance
            const oDate = UI5Date.getInstance(new Date(sISODateTime));
            return oDate.toString().substring(0, 24);
        },
        // Example: "2025-12-04T19:07:47Z" to "Fri Dec 05 2025 00:37:47"
        formatUTCDateTime: function (sDateTime) {
            // A single-run job has no series start/end - the field is empty
            // or "0". new Date(that) is "Invalid Date", which is what showed
            // in Scheduling Options. Return blank instead.
            if (!sDateTime || sDateTime === "0" ||
                String(sDateTime).replace(/[0.]/g, "") === "") {
                return "";
            }
            const oDate = UI5Date.getInstance(new Date(sDateTime));
            if (isNaN(oDate.getTime())) {
                return "";   // unparseable -> blank, never "Invalid Date"
            }
            return oDate.toString().substring(0, 24);
        },
        // Example: "2025-12-01T20:25:01" to "01.12.2025, 20:25:01"
        formatDateTimeZone: function (isoString) {
            let date;
            if (isoString) {
                date = new Date(isoString);
            } else {
                date = new Date();
            }

            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();

            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');

            return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds}`;
        },
        // Example "02.12.2025, 11:14:06" to "Tue Dec 02 2025 11:14:06 GMT+0530 (India Standard Time)"
        parseCustomDate: function (dateStr) {
            const [datePart, timePart] = dateStr.split(', ');
            const [day, month, year] = datePart.split('.').map(Number);
            const [hours, minutes, seconds] = timePart.split(':').map(Number);

            return new Date(year, month - 1, day, hours, minutes, seconds);
        },
        // Example "02.12.2025, 11:10:14" to "2025-12-02T11:10:14.000+05:30"
        /**
         * Convert "DD.MM.YYYY, HH:mm:ss" to an ABAP DEC(15) timestamp
         * string "YYYYMMDDhhmmss".
         *
         * start_date_time / end_date_time are Edm.Decimal Precision=15 on
         * this service - NOT Edm.DateTimeOffset. The /shl/ service exposed
         * them differently, which is why convertToDateTimeOffset (below)
         * returns an ISO string; sending that here fails with
         * "has invalid value".
         *
         * Returned as a string because UI5's V4 model represents
         * Edm.Decimal as a string, and a 14-digit value is safest not
         * round-tripped through a JS number.
         *
         * Returns "0" for an empty input: the field is Nullable="false",
         * so null is rejected and 0 is the initial value the ABAP engine
         * treats as "not set".
         */
        /**
         * Header status code -> readable text.
         *
         * Codes are from domain /bpcfn/DM_SCHDSTAT per the project's DDIC
         * notes: I = In Progress, C = Completed, E = Error, F = Failed.
         * 'H' (On Hold) is used by the engine on the task-level o_status.
         *
         * >>> CONFIRM THESE <<< VH_Status exposes only a "Status" element
         * with no text column, so the mapping cannot be read from the
         * service. Check the domain fixed values in SE11 and correct here.
         * Unknown codes fall through unchanged rather than being hidden.
         */
        /**
         * Consolidation unit description.
         *
         * A_CnsldtnUnit_2 has NO name field - only ConsolidationUnit,
         * Country and the two link fields. The description lives in the
         * _Text composition child (A_CnsldtnUnitT_2), which is keyed by
         * ConsolidationUnit + Language, so it is a 1:N: one row per
         * maintained language.
         *
         * The bindings therefore $expand=_Text and this formatter picks the
         * row matching the UI language, falling back to English and then to
         * whatever is there. OData V2 does not filter expanded text
         * collections by language on its own.
         *
         * Names below are confirmed against the API_CONSOLIDATIONUNIT
         * $metadata: nav property to_Text, text entity keyed by
         * Language + ConsolidationUnit.
         */
        /**
         * First non-empty of the values passed in.
         * Used for the consolidation unit description, where
         * ConsolidationUnitTextType offers long (60) / mdm (30) / short (15)
         * and any of them may be blank depending on what the client
         * maintains. Longest first.
         */
        /**
         * Task-level status (t_status on /bpcfn/xb_tasks).
         *
         * This is NOT the background job status - it is the outcome of the
         * consolidation task itself, derived in check_status() from tf261
         * (status '8'/'8E' = error for that consolidation unit). A job can
         * finish cleanly while its task errored, which is exactly what row
         * 1010 shows.
         *
         * TWO SETS OF VALUES ARE HANDLED ON PURPOSE:
         *
         *  - 'C'/'E'/'H'/'N' are the proper domain codes, once the backend
         *    is changed to write codes instead of text symbols.
         *
         *  - 'Co'/'Er' are what the field holds TODAY. t_status is CHAR 2
         *    but check_status assigns TEXT-001 ('Completed') and TEXT-002
         *    ('Error'), so ABAP truncates to the first two characters.
         *
         * The second set is a TEMPORARY bridge. It only works in English -
         * a German logon would store 'Ab' and 'Fe' and fall through to the
         * default. Remove these once t_status carries real codes.
         */
        /**
         * /bpcfn/xb_logdt-hold_reason.
         *
         *   E = the unit errored AT this task
         *   H = the unit is held because a PRECEDING task failed for it
         *
         * Both are units a restart will reprocess, which is why they share
         * one dialog rather than two.
         *
         * Blank means a row written before the column existed - those were
         * all hold rows, so blank reads as "On Hold".
         */
        holdReasonText: function (sReason) {
            switch (sReason) {
                case "E": return "Error";
                case "H": return "On Hold";
                case "D": return "Period Closed";   // MOD-009 gate
                default:  return "On Hold";
            }
        },

        holdReasonState: function (sReason) {
            // Error is red; Period-Closed and Held are both amber warnings
            // (a gate, not a failure).
            return sReason === "E" ? "Error" : "Warning";
        },

        taskStatusText: function (sStatus) {
            // Raw FC_STATUS3 codes from tf261 - the standard Data Monitor
            // detail status domain. t_status is CHAR 2, which is exactly the
            // width of this domain ('3E', '8E', '13', '16'), so the field
            // was designed to hold these codes.
            //
            // 1-5 are CG/CU OVERALL status, 6-16 are TASK status. The engine
            // reads task-level rows, so 6-16 are the expected values here;
            // 1-5 are mapped too in case an overall row is ever stored.
            switch (sStatus) {
                // --- task level ---
                case "RS": return "Restarted";   // ++ restart in progress
                case "6":  return "Initial";
                case "7":  return "Incomplete";
                case "8":  return "Error";
                case "8E": return "Error in Extension Version";
                case "9":  return "No Errors";
                case "10": return "Blocked";
                case "11": return "Unblocked";
                case "12": return "Irrelevant";
                case "13": return "Pending Preceding Task";
                case "14": return "Being Copied";
                case "15": return "Blocked by User";
                case "16": return "Unblocked After User Block";
                // --- overall (CG/CU) level ---
                case "1":  return "Initial";
                case "2":  return "Incomplete";
                case "3":  return "Error";
                case "3E": return "Error in Extension Version";
                case "4":  return "Complete";
                case "5":  return "Complete, Higher CG Notified";
                // --- legacy: truncated text symbols written by the current
                //     engine build. Remove once t_status holds real codes.
                case "Co": return "Completed";
                case "Er": return "Error";
                case "":
                case undefined:
                case null: return "";
                default:   return sStatus;
            }
        },

        taskStatusState: function (sStatus) {
            if (sStatus === "RS") { return "Information"; }   // restarted
            switch (sStatus) {
                case "9":
                case "4":
                case "5":
                case "11":
                case "16":
                case "Co": return "Success";
                case "8":
                case "8E":
                case "3":
                case "3E":
                case "Er": return "Error";
                case "7":
                case "2":
                case "10":
                case "13":
                case "15": return "Warning";
                case "6":
                case "1":
                case "12":
                case "14": return "Information";
                default:   return "None";
            }
        },

        firstNonEmpty: function () {
            for (var i = 0; i < arguments.length; i++) {
                var v = arguments[i];
                if (v !== null && v !== undefined && String(v).trim() !== "") {
                    return v;
                }
            }
            return "";
        },

        consUnitDescription: function (oText) {
            // Never throw from a formatter - an exception here aborts the
            // whole binding and the control renders empty with no clue why.
            try {
            if (!oText) { return ""; }

            // V2 returns an expanded 1:N as { results: [...] }
            var aRows = Array.isArray(oText) ? oText
                      : (oText.results && Array.isArray(oText.results) ? oText.results : []);
            if (!aRows.length) { return ""; }

            var sUi = (sap.ui.getCore().getConfiguration().getLanguage() || "en")
                        .substring(0, 2).toUpperCase();

            var fnLang = function (o) {
                return String(o.Language || o.language || "").substring(0, 2).toUpperCase();
            };
            var oRow = aRows.filter(function (o) { return fnLang(o) === sUi; })[0]
                    || aRows.filter(function (o) { return fnLang(o) === "EN"; })[0]
                    || aRows[0];

            // ConsolidationUnitTextType (confirmed from $metadata) offers
            // three descriptions of increasing length:
            //   ConsolidationUnitText      String(15)  short
            //   ConsolidationUnitMdmText   String(30)  medium
            //   ConsolidationUnitLongText  String(60)  long
            // Longest first - a value help column has room, and the short
            // text is often an abbreviation rather than a real name.
            return oRow.ConsolidationUnitLongText
                || oRow.ConsolidationUnitMdmText
                || oRow.ConsolidationUnitText
                || "";
            } catch (e) {
                return "";
            }
        },

        /**
         * Fiscal year + period as a single "YYYY/PPP" cell.
         *
         * fc_year is NUMC(4) and fc_period NUMC(3), so both are
         * zero-padded in the database ("2026" / "009"). Padding is
         * significant - period 9 and period 90 are different periods - so
         * it is re-applied here rather than trusted.
         *
         * Re-padding matters because a value can lose its zeros in transit:
         * JSON numbers drop them, and any Number() or parseInt() on the way
         * through does the same. padStart is idempotent, so a value that
         * arrives correctly padded is unchanged.
         *
         * A value LONGER than its DDIC length is left alone rather than
         * truncated - that would be data loss, and it signals a problem
         * worth seeing rather than hiding.
         */
        fiscalYearPeriod: function (vYear, vPeriod) {
            const fnPad = function (v, iLen) {
                if (v === null || v === undefined) { return ""; }
                const sVal = String(v).trim();
                if (!sVal) { return ""; }
                return sVal.length < iLen ? sVal.padStart(iLen, "0") : sVal;
            };
            const sYear = fnPad(vYear, 4);      // NUMC(4)
            const sPeriod = fnPad(vPeriod, 3);  // NUMC(3)
            if (sYear && sPeriod) { return sYear + "/" + sPeriod; }
            return sYear || sPeriod || "";
        },

        // DM / CM to a readable label for the list column.
        taskTypeText: function (sType) {
            switch (sType) {
                case "DM": return "Data Monitor";
                case "CM": return "Consolidation Monitor";
                default:   return sType || "";
            }
        },

        statusText: function (sStatus) {
            switch (sStatus) {
                case "I": return "In Progress";
                case "C": return "Completed";
                case "E": return "Error";
                case "F": return "Failed";
                case "H": return "On Hold";
                case "B": return "Blocked";   // all tasks blocked (MOD-010)
                // 'S' is not in domain /BPCFN/GR_DM_SCHDSTAT (I/C/E/F) but
                // appears in the data - the engine writes the header status
                // from text symbols, and "Scheduled" truncates to 'S' in a
                // CHAR 1 field. Confirm with
                //   SELECT DISTINCT status FROM /bpcfn/xb_schd
                // and fix in ABAP if it is an artefact rather than a status.
                case "S": return "Scheduled";
                case "X": return "Cancelled";
                case "":
                case undefined:
                case null: return "";
                default:  return sStatus;
            }
        },

        /** Matching sap.ui.core.ValueState for the status code. */
        /**
         * NOTE: there is a SECOND statusState earlier in this file (~line 7)
         * carried over from the /shl/ app, which switches on display text
         * ("Finished", "Canceled", ...). In a JS object literal the later
         * definition wins, so THIS one is active and that one is dead code.
         * Worth deleting the earlier one - two functions with one name is a
         * trap for the next person.
         */
        statusState: function (sStatus) {
            switch (sStatus) {
                case "C": return "Success";
                case "E":
                case "F": return "Error";
                case "H": return "Warning";
                case "B": return "Warning";        // blocked - a gate, not a failure
                case "I": return "Information";
                case "S": return "Information";   // scheduled, not yet run
                case "X": return "Error";          // cancelled - not a failure
                default:  return "None";
            }
        },

        toAbapTimestamp: function (dateString) {
            if (!dateString) { return "0"; }
            var parts = String(dateString).split(", ");
            if (parts.length < 2) { return "0"; }
            var d = parts[0].split(".");
            var t = parts[1].split(":");
            if (d.length < 3 || t.length < 3) { return "0"; }
            var pad = function (v, n) { return String(parseInt(v, 10)).padStart(n || 2, "0"); };
            return pad(d[2], 4) + pad(d[1]) + pad(d[0]) + pad(t[0]) + pad(t[1]) + pad(t[2]);
        },

        convertToDateTimeOffset: function (dateString) {
            var parts = dateString.split(", ");
            var dateParts = parts[0].split(".");
            var timeParts = parts[1].split(":");

            var splitDay = parseInt(dateParts[0], 10);
            var splitMonth = parseInt(dateParts[1], 10) - 1;
            var splitYear = parseInt(dateParts[2], 10);

            var splitHours = parseInt(timeParts[0], 10);
            var splitMinutes = parseInt(timeParts[1], 10);
            var splitSeconds = parseInt(timeParts[2], 10);

            var date = new Date(splitYear, splitMonth, splitDay, splitHours, splitMinutes, splitSeconds);

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');

            const finalDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`

            // Format with timezone offset
            var tzOffset = -date.getTimezoneOffset(); // in minutes
            var sign = tzOffset >= 0 ? "+" : "-";
            var offsetHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
            var offsetMinutes = String(Math.abs(tzOffset) % 60).padStart(2, '0');

            return finalDate.replace("Z", sign + offsetHours + ":" + offsetMinutes);
        },
        //"2025-12-04T19:07:47Z" to "05.12.2025, 00:37:47"
        convertIsoToLocalFormat: function (isoString) {
            // Parse ISO string to Date object
            const date = new Date(isoString);

            // Format using Intl.DateTimeFormat or manually
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');

            return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds}`;
        }
    };
});