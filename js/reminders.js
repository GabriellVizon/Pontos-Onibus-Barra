(function () {
    'use strict';

    var STORAGE_KEY = 'busRemindersV1';
    var timers = {};
    var onFireCallback = null;

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            var list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function save(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) { /* storage cheio ou indisponível */ }
    }

    function isPermissionGranted() {
        return typeof Notification !== 'undefined' && Notification.permission === 'granted';
    }

    function requestPermission() {
        if (typeof Notification === 'undefined') return Promise.resolve('denied');
        if (Notification.permission === 'granted') return Promise.resolve('granted');
        return Notification.requestPermission();
    }

    function fire(reminder) {
        remove(reminder.id);
        var message = 'O ônibus das ' + reminder.departure + ' sai em ' + reminder.minutesBefore + ' min.';
        if (isPermissionGranted()) {
            try {
                var notification = new Notification('BarraBus - ' + reminder.stopName, {
                    body: message,
                    icon: 'img/icon-192.png'
                });
                notification.onclick = function () {
                    window.focus();
                    this.close();
                };
                return;
            } catch (e) { /* fallback abaixo */ }
        }
        if (onFireCallback) onFireCallback(reminder);
    }

    function schedule(reminder) {
        var delay = reminder.triggerAt - Date.now();
        if (delay < 0) {
            remove(reminder.id);
            return;
        }
        clearTimeout(timers[reminder.id]);
        timers[reminder.id] = setTimeout(function () {
            delete timers[reminder.id];
            fire(reminder);
        }, delay);
    }

    function add(opts) {
        var departure = opts && opts.departure;
        var minutesBefore = Number(opts && opts.minutesBefore);
        if (!departure || !Number.isFinite(minutesBefore)) return null;

        var trigger = reminderTriggerDate(departure, minutesBefore);
        if (!trigger) return null;

        var reminder = {
            id: 'rem-' + opts.stopId + '-' + Date.now(),
            stopId: opts.stopId,
            stopName: opts.stopName,
            departure: departure,
            minutesBefore: minutesBefore,
            triggerAt: trigger.getTime(),
            createdAt: Date.now()
        };

        var list = load();
        list.push(reminder);
        save(list);
        schedule(reminder);
        return reminder;
    }

    function remove(id) {
        var list = load().filter(function (r) { return r.id !== id; });
        save(list);
        clearTimeout(timers[id]);
        delete timers[id];
    }

    function cancelForStop(stopId) {
        load().forEach(function (r) {
            if (String(r.stopId) === String(stopId)) remove(r.id);
        });
    }

    function list() {
        return load();
    }

    function hasForStop(stopId) {
        return load().some(function (r) { return String(r.stopId) === String(stopId); });
    }

    function sync() {
        var list = load();
        var now = Date.now();
        var keep = list.filter(function (r) { return r.triggerAt > now; });
        if (keep.length !== list.length) save(keep);
        keep.forEach(schedule);
    }

    function init(opts) {
        if (opts && typeof opts.onFire === 'function') onFireCallback = opts.onFire;
        sync();
    }

    window.Reminders = {
        init: init,
        add: add,
        remove: remove,
        cancelForStop: cancelForStop,
        list: list,
        hasForStop: hasForStop,
        sync: sync,
        requestPermission: requestPermission,
        isPermissionGranted: isPermissionGranted
    };
})();