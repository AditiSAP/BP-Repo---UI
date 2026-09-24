sap.ui.define([
    "com/bpcfn/jobscheduler/util/ClientTimeZone"
], function (ClientTimeZone) {
    return {
        /**
         * Calculates the standard timezone offset for a given date
         * @param {Date} date - The date to calculate offset for
         * @returns {number} The standard timezone offset in minutes
         */
        stdTimezoneOffset: function (date) {
            var j = new Date(date.getFullYear(), 0, 1);
            var a = new Date(date.getFullYear(), 6, 1);
            return Math.max(j.getTimezoneOffset(), a.getTimezoneOffset());
        },
        /**
         * Checks if a given date is in daylight saving time
         * @param {Date} date - The date to check
         * @returns {boolean} True if the date is in DST, false otherwise
         */
        dst: function (date) {
            return date.getTimezoneOffset() < this.stdTimezoneOffset(date);
        },
        isDSTSupported: function (d) {
            var j = new Date(d.getFullYear(), 0, 1);
            var a = j.getTimezoneOffset();
            var b = new Date(d.getFullYear(), 6, 1);
            var c = b.getTimezoneOffset();
            if (a === c) {
                return false;
            } else {
                return true;
            }
        },
        UTCoffset: 0,
        UTCoffsetT: '+0000S',
        hasDST: false,
        getBrowserTZ: function () {
            var s = ClientTimeZone;
            var n = new Date();
            var d = new Date(n.getFullYear(), 0, 1);
            var a = -d.getTimezoneOffset();
            s.UTCoffset = a;
            var b = new Date(n.getFullYear(), 5, 1);
            var c = -b.getTimezoneOffset();
            if (a !== c) {
                s.hasDST = true;
            }
            if (a - c >= 0) {
                s.UTCoffset = c;
            }
            c = (a < 0 ? -a : a) / 60;
            var h = Math.floor(c);
            var m = c - h;
            c = h * 100 + m * 60;
            s.UTCoffsetT = (a < 0 ? '-' : '+') + (h < 10 ? '0' : '') + c.toString() + (s.hasDST ? 'D' : 'S');
            s.DSTCurrentlyActive = this.dst(n);
            return s;
        }
    };
});