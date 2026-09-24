# Backend gaps — must be closed before the app runs clean

The UI is fully aligned to `ODataV4_metadata.txt` except for three entity
sets the donated code calls that your service does not expose. Two of them
already exist as CDS views in your bundle and only need exposing.

## 1. `ErrorLog` — on-hold / error list

Called from `JobDetail.controller.js` and rendered by
`fragments/onHoldUnitsDetails.fragment.xml`.

You already have the view. Add to `sd_xb_schd_task_api.srvd.srvdsrv`:

```abap
expose /BPCFN/BV_XB_SH_SCHD_ERROR_LOG as ErrorLog;
```

Confirm the exposed element names match what the fragment binds
(`Guid`, `JobRecCount`, `TaskId`, `ConUnit`) and adjust either side.

## 2. `F4VariantCopy` — variant copy value help

Used by `NewSchedule.view.xml` line 147, bound to `schdMod>/selected_variant`
(`selected_variant` is a real field, `String(14)`).

Your bundle has `/BPCFN/BV_XB_SH_SCHD_ZCOPY`, which is almost certainly
this. Add:

```abap
expose /BPCFN/BV_XB_SH_SCHD_ZCOPY as F4VariantCopy;
```

The fragment binds `Variant` and `VariantText`. Check the view's actual
element names and align — these two are the only field bindings still
unmatched in the whole app.

If `ZCOPY` turns out to be something else, the fallback is to hide that
`Select`: it is one control and the wizard works without it.

## 3. `CheckAuth` — authorization check

`NewSchedule.controller.js:410` does `bindContext("/CheckAuth")`. There is
no equivalent in your service — no such entity set, and your only actions
are `addTasksBySequence`, `restartFrom`, `restartSelected`.

This drives `/CreateEnabled`, `/CopyEnabled`, `/CancelEnabled`,
`/ManualActivityEnabled` in the `schdMod` JSON model — i.e. which toolbar
buttons are active.

Two options:

- **Add it.** A function returning the four booleans, exposed as an
  unbound function import. Closest to the donated design.
- **Stub it.** Default all four flags to `true` in the controller and let
  the backend reject unauthorised calls. Faster; loses button-level
  greying only.

Until one is chosen the call fails and the toolbar flags stay undefined.

## Also missing: consolidation unit value help

`API_CONSOLIDATIONUNIT` is declared as `consUnitService` in the manifest
and is a standard S/4HANA service. Publish it in `/IWFND/MAINT_SERVICE` —
nothing to build. Same for `APJ_JOB_MANAGEMENT_SRV` (`standardService`),
which supplies timezones, job templates and run logs.

## Two DDIC points worth re-checking

- **`restart` is `String(1)`** in the V4 metadata, but the engine writes
  `'ST'` / `'FT'` and your own domain doc says `/bpcfn/DM_RESTART` is
  CHAR 2. At length 1 these truncate and the restart branch never matches.
  Verify which is live.
- **`VH_BlkUnblkStat.BlkUnblkStat` is `String(10)`** while
  `SchedulerTask.block_unblock` is `String(3)`. The 10 comes from
  `dd07l-domvalue_l`. Harmless for a dropdown, but cast or trim if you
  ever compare them directly.
