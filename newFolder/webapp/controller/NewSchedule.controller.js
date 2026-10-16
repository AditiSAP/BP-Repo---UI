sap.ui.define([
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/ui/core/Fragment",
	"sap/ui/model/Filter",
	"sap/m/Token",
	"sap/ui/model/FilterOperator",
	"com/bpcfn/jobscheduler/controller/BaseController",
	"com/bpcfn/jobscheduler/model/formatter"
], function (JSONModel, MessageBox, Fragment, Filter, Token, FilterOperator, BaseController, formatter) {
	"use strict";

	return BaseController.extend("com.bpcfn.jobscheduler.controller.NewSchedule", {
		formatter: formatter,
		onInit: function () {
			this.oRouter = this.getOwnerComponent().getRouter();
			this.oRouter.getRoute("NewSchedule").attachPatternMatched(this._onNewScheduleMatched, this);
			this._wizard = this.byId("CreateJobWizard");
			this.busyDialog = new sap.m.BusyDialog();

			this.jobTasks = this.byId("idJobTasks");
			this.tasksTable = this.byId("idTasksTable");
			this.i18nModel = this.getOwnerComponent().getModel("i18n").getResourceBundle();
			this.selTasks = [];
			this.selConsUnit = [];
			this._wireUnitValidator();
			var today = new Date();
			this.currMonth = ("00" + (today.getMonth() + 1)).slice(-3);
			this.currYear = today.getFullYear();

			const oMM = sap.ui.getCore().getMessageManager();
			oMM.registerObject(this.getView(), true); // attach to the view
			this.getView().setModel(oMM.getMessageModel(), "message"); // for MessagePopover binding
		},
		_onNewScheduleMatched: async function (oEvent) {
			this.selTaskModel = new JSONModel();
			this.selTaskModel.setData({ results: [] });
			this.getView().setModel(this.selTaskModel, "selTaskModel");
			const consGrpModel = new JSONModel();
			consGrpModel.setSizeLimit(99999);
			consGrpModel.setData({ results: [] });
			this.getView().setModel(consGrpModel, "consGrpModel");
			this.schdMod = new JSONModel();
			this.schdMod.setSizeLimit(99999);
			await this.initializeData();
			await this.readTimeZone();
			this.getView().setModel(this.schdMod, "schdMod");
			await this.filterConsGrp();
			this.schdMod.setProperty("/SchDateValueState", "None");
			var sJobID = oEvent.getParameter("arguments").jobId;
			var sJobRecCount = oEvent.getParameter("arguments").jobRecCount;

			// Build the generic user list on BOTH paths. It used to sit
			// inside the edit branch below, which was fine while the Select
			// was bound straight to /VH_GenericUser - the control loaded its
			// own data. Now that the list is built here, a create run left
			// genericUserModel unset and the dropdown empty.
			await this.validateGenericUser();

			if (sJobID !== "create") {
				var taskData = await this.readTaskDetails(sJobID, sJobRecCount, "schdMod", "/RepTypeVisible");
				await this.readF4TaskData();
				this.filterF4Tasks(undefined, this.getView().getModel("schdMod").getProperty("/task_type"));
				await this.filterConsGrp();
				taskData.forEach(function (item) {
					this.selTasks.push({
						key: item.task_id, text: item.task_id
					});
				}.bind(this));
				this.selTaskModel.setData({ results: taskData });
				this.getView().getModel("schdMod").setProperty("/jobname", oEvent.getParameter("arguments").jobName.substring(0, 20));
				await this.convertTimeZone(this.getView().getModel("schdMod").getProperty("/scheduling_timezone"), "schdMod", "/SchEndDt", this.formatter.convertIsoToLocalFormat(this.getView().getModel("schdMod").getProperty("/end_date_time")));
				this.getView().getModel("schdMod").setProperty("/TaskTokens", this.selTasks);
				this.byId("idSrtImmCheckBx").fireSelect({ selected: true });
				this.jobTasks.fireTokenUpdate();
			}
		},
		initializeData: async function () {
			var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({
				pattern: "dd.MM.yyyy"
			});
			var oTimeFormat = sap.ui.core.format.DateFormat.getTimeInstance({
				pattern: "HH:mm:ss"
			});
			var oDate = new Date();
			var sFormattedDate = oDateFormat.format(oDate);
			var sFormattedTime = oTimeFormat.format(oDate);
			var sCombinedDate = sFormattedDate + ", " + sFormattedTime;
			// Extract timezone code with proper null/undefined checks
			var timezoneCode = Intl.DateTimeFormat().resolvedOptions().timeZone;
			try {
				var userTimezone = await this.readUsersTimezoneFromBackend();
				if (userTimezone && userTimezone.results && userTimezone.results.length > 0 && userTimezone.results[0] && 'Code' in userTimezone.results[0]) {
					timezoneCode = userTimezone.results[0].Code;
				}
			} catch (error) {
				// Browser timezone (already set above) will be used as fallback
				MessageBox.error(this.i18nModel.getText("timezoneErr"), {
					details: error && (error.message || String(error))
				});
			}
			this.schdMod.setData({
				task_type: "DM",
				ConsGrpTokens: [],
				// Demo defaults carried over from the /shl/ app. "SHELL" is that
				// customer's consolidation group and will not exist here; "G10"
				// and "G1" are their version and COA. Blank them so the user
				// picks from the value helps, or replace with your own defaults.
				version: "",
				coa: "BP",   // default Chart of Accounts
				con_grp: "",
				TaskTokens: [],
				ConsUnitTokens: [],
				prd_days: "",
				start_immed: "X",
				jobname: "",
				testmode: false,
				RepType: 0,
				RepTypeVisible: false,
				SchDate: sFormattedDate,
				SchTime: sFormattedTime,
				scheduling_timezone: timezoneCode,
				TimeZoneCode: Intl.DateTimeFormat().resolvedOptions().timeZone,
				start_date_time: sCombinedDate,
				selected_variant: "",
				SchDateValueState: "None",
				block_unblock: "",
				end_type_c: "",
				max_iterations: "",
				periodic_value: 0,
				generic_user_id: "",
				schJobBtnVisible: false,
				ConsUnitEditable: true,
				// Recurrence fields
				RecurrenceSetIndicator: false,
				SchEndDt: "",
				SchEndTime: "",
				BeginEndMonthSelection: "B",
				MonthDay: "1",
				MonthsDayType: "D",
				MonthsDaysType: "D",
				WeekNumber: "W1",
				MonthWeekDay: "D1",
				WeekDays: [],
				MonthOnlyWorkdaysInd: false,
				StartRestrictionCode: "A",
				StartRestrictionCodeEnabled: false,
				CalendarId: "",
				CalendarSelectionEnabled: false,
				// Visibility flags for "On" sub-selectors
				OnFieldVisible: false,
				MonthsDayNrVisible: false,
				MonthsDayTypeVisible: false,
				MonthsNegDayNrVisible: false,
				MonthsDaysTypeVisible: false,
				MonthWeekCodeVisible: false,
				MonthWeekdayVisible: false,
				WeeksDaySelectionVisible: false
			});
		},
		validateGenericUser: async function () {
			const oModel = this.getOwnerComponent().getModel("custModel");
			const oListBinding = oModel.bindList("/VH_GenericUser");

			// Fetch all GENERIC_USER entries in batches to avoid relying on default page size
			const iBatchSize = 500;
			let iStartIndex = 0;
			let aAllData = [];
			// Paginate through all contexts
			// requestContexts(start, length) will return up to "length" contexts starting from "start"
			// Stop when a batch comes back empty or smaller than the batch size
			// to ensure we have collected all entries.
			while (true) {
				// eslint-disable-next-line no-await-in-loop
				const aBatchContexts = await oListBinding.requestContexts(iStartIndex, iBatchSize);
				if (!aBatchContexts || aBatchContexts.length === 0) {
					break;
				}
				aAllData = aAllData.concat(aBatchContexts.map(function (oCtx) {
					return oCtx.getObject();
				}));
				if (aBatchContexts.length < iBatchSize) {
					// Last page reached
					break;
				}
				iStartIndex += iBatchSize;
			}
			const generic_user_id = this.getView().getModel("schdMod").getProperty("/generic_user_id");
			// VH_GenericUser exposes "Bname" - "user_id" is a leftover /shl/
			// name that never matched, so this always cleared the selection.
			const generic_user_id_match = aAllData.find(function (o) {
				return o.Bname === generic_user_id;
			});

			if (!generic_user_id_match) {
				this.getView().getModel("schdMod").setProperty("/generic_user_id", "");
			}

			// Feed the Select from a JSONModel with a blank first entry.
			// A Select bound straight to an OData set has no way back to
			// "nothing selected" once a value is picked - forceSelection
			// only stops it auto-selecting the first row on load.
			const aItems = [{ key: "", text: this.i18nModel.getText("GenericUserNone") }];
			aAllData.forEach(function (o) {
				if (o.Bname) {
					aItems.push({ key: o.Bname, text: o.Bname });
				}
			});
			this.getView().setModel(new JSONModel({ items: aItems }), "genericUserModel");
		},
		onDigit3LiveChange: function (oEvent) {
			const oInput = oEvent.getSource();
			// Raw value as the user types
			let s = oEvent.getParameter("value") || "";
			// Keep only digits 0–9
			s = s.replace(/\D+/g, "");
			// Truncate to 3 digits
			if (s.length > 3) {
				s = s.slice(0, 3);
			}
			// Push sanitized value back without firing events again
			if (oInput.getValue() !== s) {
				oInput.setValue(s);
			}
			// Live value state feedback
			if (s.length === 0 || Number(s) > 999) {
				oInput.setValueState("Error");
			} else {
				oInput.setValueState("None");
			}
		},
		onDigit3Change: function (oEvent) {
			const oInput = oEvent.getSource();
			const s = (oInput.getValue() || "").replace(/\D+/g, "").slice(0, 3);
			oInput.setValue(s);
			if (s.length === 0 || Number(s) > 999) {
				oInput.setValueState("Error");
				oInput.setValueStateText(this.i18nModel.getText("upto3Digits"));
			} else {
				oInput.setValueState("None");
				oInput.setValueStateText("");
			}
		},
		onTaskTypeSelected: function (oEvent) {
			this.filterF4Tasks(oEvent);
		},
		filterF4Tasks: function (oEvent, taskType) {
			const selIndex = oEvent ? oEvent.getParameter("selectedIndex") : taskType === "DM" ? 0 : 1;
			const schdMod = this.getView().getModel("schdMod");
			this.selTaskModel.setData({ results: [] });
			this.selTasks = [];
			this.getView().getModel("schdMod").setProperty("/TaskTokens", this.selTasks);
			if (selIndex !== 0) {
				this.selConsUnit = [];
				this.getView().getModel("schdMod").setProperty("/ConsUnitTokens", this.selConsUnit);
			}
			schdMod.setProperty("/task_type", selIndex === 0 ? "DM" : "CM");
			schdMod.setProperty("/ConsUnitEditable", selIndex === 0 ? true : false);
			this.firstStepValidation(true);
		},
		onJobNameChange: function (oEvent) {
			this.getView().getModel("schdMod").setProperty("/jobname", oEvent.getParameter("value"));
			this.firstStepValidation(true);
		},
		onTaskStepActivate: function () {
			this.firstStepValidation(true);
		},
		firstStepValidation: function (bIsTaskStep) {
			const jobname = this.getView().getModel("schdMod")?.getProperty("/jobname") ?? "";
			const jobTasks = this.getView().getModel("schdMod")?.getProperty("/TaskTokens") ?? [];
			if (bIsTaskStep) {
				this._wizard.discardProgress(this._wizard.getSteps()[0]);
			} else {
				this._wizard.discardProgress(this._wizard.getSteps()[1]);
			}
			if (jobTasks.length > 0 && jobname.length > 0) {
				this._wizard.validateStep(this.byId("TaskSelStep"));
			} else {
				this._wizard.invalidateStep(this.byId("TaskSelStep"));
				this.enableSchChkFn(false);
			}
			const taskMatch = jobTasks.find(u => u.key === "ZCOPY");
			const blockStatus = this.getView().getModel("schdMod")?.getProperty("/block_unblock") ?? false;
			if (taskMatch && !blockStatus) {
				this.byId("ParamSelStep").setNextStep(this.getView().byId("VariantSelStep"));
				this.byId("ParamSelStep").setValidated(true);
			} else {
				if (jobTasks.length > 0) {
					const schdMod = this.getView().getModel("schdMod");
					if (schdMod) {
						schdMod.setProperty("/selected_variant", "");
					}
				}
				this.byId("ParamSelStep").setNextStep(null);
				this.byId("ParamSelStep").setValidated(false);
			}
		},
		secondStepValidation: function () {
			if (!this.schdMod) { return; }
			const startImmChecked = this.schdMod.getData().start_immed ? true : false;
			if (!startImmChecked) {
				const schDt = this.schdMod.getData().SchDate;
				if (schDt) {
					this._wizard.validateStep(this.byId("SchdOptionStep"));
					this.schdMod.setProperty("/SchDateValueState", "None");
					this.enableSchChk = true;
					this.enableSchChkFn(true);
				} else {
					this._wizard.invalidateStep(this.byId("SchdOptionStep"));
					this._wizard.discardProgress(this._wizard.getSteps()[2]);
					this.enableSchChk = false;
					this.enableSchChkFn(false);
				}
			} else {
				this._wizard.validateStep(this.byId("SchdOptionStep"));
				this.schdMod.setProperty("/SchDateValueState", "None");
				this.enableSchChk = true;
				this.enableSchChkFn(true);
			}
		},
		enableSchChkFn: function (bFlag) {
			this.getView().getModel("schdMod")?.setProperty("/schJobBtnVisible", bFlag);
		},
		onSecondStepCompleted: function () {
			this.enableSchChkFn(this.enableSchChk);
		},
		onPressRecurrPatrn: async function () {
			if (!this._oRecurrPatrnDialog) {
				this._oRecurrPatrnDialog = await Fragment.load({
					id: this.getView().getId(),
					name: "com.bpcfn.jobscheduler.fragments.defRecurrPatrn",
					controller: this
				});
				this.getView().addDependent(this._oRecurrPatrnDialog);
			}
			this._oRecurrPatrnDialog.open();
		},
		validateSchedule: function (schdMod) {
			// If recurrence is not enabled, no further validation needed
			if (!schdMod.RecurrenceSetIndicator) {
				return { ok: true };
			}
			// NOTE: was "if (schdMod?.prd_days || schdMod.prd_days.trim() !== \"\")".
			// The || made the optional chain pointless and threw a TypeError
			// whenever prd_days was undefined. Must be &&.
			if (schdMod?.prd_days && schdMod.prd_days.trim() !== "") {

				// periodic_value must be a positive integer
				if (!schdMod.periodic_value || Number(schdMod.periodic_value) === 0) {
					return { ok: false, valueState: "/periodic_value_vs", valueStateText: "/periodic_value_vst" };
				}

				// ---- end condition ----------------------------------------
				// A periodic job MUST have exactly one stop condition.
				//
				// The engine decides purely on whether max_iterations is
				// initial (line 3014 / 3029 of /BPCFN/CL_XB_FINCS_SCHD_TASK):
				//   max_iterations <> 0  -> stop after N runs
				//   max_iterations  = 0  -> stop at end_date_time
				//
				// If BOTH are 0 the WHILE at line 3060 evaluates false on every
				// clause, the loop body never runs, and NO recurrence is ever
				// scheduled. No error is raised - the job is simply created and
				// silently never repeats. That is what this check prevents.
				const iterations = Number(schdMod.max_iterations);
				const bHasIterations = Number.isInteger(iterations) && iterations > 0;
				const bHasEndDate = !!(schdMod.end_date_time &&
					String(schdMod.end_date_time).trim() !== "");

				if (schdMod.end_type_c === "NUM") {
					if (!bHasIterations) {
						return { ok: false, valueState: "/max_iterations_vs", valueStateText: "/max_iterations_vst" };
					}
				} else if (schdMod.end_type_c === "DATE") {
					if (!bHasEndDate) {
						return { ok: false, valueState: "/SchDateValueState", valueStateText: "/SchEndDt_vst",
						         message: "EndDateRequired" };
					}
				} else {
					// no end type chosen at all
					return { ok: false, valueState: "/end_type_c_vs", valueStateText: "/end_type_c_vst",
					         message: "EndConditionRequired" };
				}

				// Neither populated, whatever end_type_c claims - the silent
				// no-recurrence case. Belt and braces.
				if (!bHasIterations && !bHasEndDate) {
					return { ok: false, valueState: "/end_type_c_vs", valueStateText: "/end_type_c_vst",
					         message: "EndConditionRequired" };
				}
			}
			return { ok: true };
		},

		/**
		 * end_type_c is Edm.String MaxLength=1, but the UI works with the
		 * readable keys "NUM" / "DATE" - sending those raises
		 * "has invalid value" on a 1-character field.
		 *
		 * The engine never reads end_type_c (it branches on
		 * max_iterations IS INITIAL), so this is bookkeeping only and any
		 * stable 1-char code works. Confirm N/D against the DDIC domain if
		 * one is defined for the field.
		 */
		_endTypeCode: function (sUiValue) {
			switch (sUiValue) {
				case "NUM":  return "N";
				case "DATE": return "D";
				default:     return "";
			}
		},
		onPressOk: function (oEvent) {
			var schdMod = this.getView().getModel("schdMod");
			const result = this.validateSchedule(schdMod.getData());
			if (!result.ok) {
				schdMod.setProperty(result.valueState, "Error");
				schdMod.setProperty(result.valueStateText,
					this.i18nModel.getText(result.message || "upto3Digits"));
				if (result.message) {
					MessageBox.error(this.i18nModel.getText(result.message));
				}
				return;
			}
			oEvent.getSource().getParent().close();
		},
		onlvChangeSchDate: function () {
			this._wizard.invalidateStep(this.byId("SchdOptionStep"));
			this._wizard.discardProgress(this._wizard.getSteps()[2]);
			this.schdMod.setProperty("/SchDateValueState", "None");
			this.enableSchChkFn(false);
		},
		onChangeSchDate: function () {
			this.onSelectionChangeTimeZone();
		},
		readF4TaskData: async function () {
			try {
				const oModel = this.getOwnerComponent().getModel("custModel");
				const schdMod = this.getView().getModel("schdMod");
				let jsonModel = new sap.ui.model.json.JSONModel();
				this.getView().setModel(jsonModel, "taskModel");

				// VH_TaskGroup is now PARAMETERISED by version/year/period - it
				// calls the period-category AMDP internally and returns each task
				// once with its REAL sequence. All three are required; without
				// them the period category (and thus the sequence) is unknown.
				const version = String(schdMod.getProperty("/version") || "").trim();
				const fcYear  = String(schdMod.getProperty("/fc_year") || "").trim();
				const fcPer   = String(schdMod.getProperty("/fc_period") || "").trim();
				if (!version || !fcYear || !fcPer) {
					// not enough context yet to resolve the sequence
					jsonModel.setData({ results: [] });
					return;
				}

				// parameterised entity path: VH_TaskGroup(p_version=,p_year=,p_period=)/Set
				const sPath = "/VH_TaskGroup(p_version='" + version +
					"',p_year='" + fcYear.padStart(4, "0") +
					"',p_period='" + fcPer.padStart(3, "0") + "')/Set";
				// still filter by the chosen task type (DM/CM) client-side via $filter
				const taskFilters = [
					new sap.ui.model.Filter("TaskType", sap.ui.model.FilterOperator.EQ, schdMod.getProperty("/task_type"))
				];
				const oListBinding = oModel.bindList(sPath, undefined, undefined, taskFilters);
				this.busyDialog.open();
				const aContexts = await oListBinding.requestContexts(0, 99999);
				this.busyDialog.close();
				let aData = aContexts.map(ctx => ctx.getObject());
				aData = aData.sort((a, b) => a.Seqno - b.Seqno);
				jsonModel.setData({ results: aData });
			} catch (error) {
				this.busyDialog.close();
				MessageBox.error(this.i18nModel.getText("FailedData"));
			}
		},
		handleValueHelpTasks: async function (oEvent) {
			this._vhField = oEvent.getSource();
			// Tasks are sequenced by period category, so version + year + period
			// must be set before the list can be built. Guide the user if not.
			const m = this.getView().getModel("schdMod");
			if (!String(m.getProperty("/version") || "").trim() ||
			    !String(m.getProperty("/fc_year") || "").trim() ||
			    !String(m.getProperty("/fc_period") || "").trim()) {
				MessageBox.warning(this.i18nModel.getText("TaskScopeMissing"));
				return;
			}
			await this.readF4TaskData();
			// Guard against concurrent opens: if a load is already in progress,
			// await the same promise instead of starting a second Fragment.load
			// (which would create duplicate IDs for idTaskVHTable).
			if (!this._oTaskVHDialog) {
				if (!this._oTaskVHDialogPromise) {
					this._oTaskVHDialogPromise = Fragment.load({
						id: this.getView().getId(),
						name: "com.bpcfn.jobscheduler.fragments.jobTemplateValueHelp",
						controller: this
					}).then(function (oDialog) {
						this.getView().addDependent(oDialog);
						this._oTaskVHDialog = oDialog;
						this._oTaskVHDialogPromise = null;
						return oDialog;
					}.bind(this));
				}
				await this._oTaskVHDialogPromise;
			}
			this._preselectTaskRows();
			this._oTaskVHDialog.open();
		},

		/**
		 * Tick the value-help rows whose task is already a token on idJobTasks.
		 * readF4TaskData rebinds the table each open, so selection must be
		 * re-applied against the freshly bound items.
		 */
		_preselectTaskRows: function () {
			const oTbl = this.byId("idTaskVHTable");
			if (!oTbl) { return; }
			// keys already selected (the tokens on the Tasks MultiInput)
			const oInput = this.byId("idJobTasks");
			const oSel = {};
			(oInput ? oInput.getTokens() : []).forEach(function (t) { oSel[t.getKey()] = true; });
			// binding may not be ready synchronously right after load; defer once
			const fnApply = function () {
				oTbl.getItems().forEach(function (oItem) {
					const oCtx = oItem.getBindingContext("taskModel");
					const sKey = oCtx && oCtx.getObject() ? oCtx.getObject().Cacti : null;
					oTbl.setSelectedItem(oItem, !!(sKey && oSel[sKey]));
				});
			};
			fnApply();
			setTimeout(fnApply, 0);   // catch late-bound rows
		},

		handleValueHelpVersion: async function (oEvent) {
			this._vhField = oEvent.getSource();
			if (!this._oVersionVHDialog) {
				this._oVersionVHDialog = await Fragment.load({
					id: this.getView().getId(),
					name: "com.bpcfn.jobscheduler.fragments.versionValueHelp",
					controller: this
				});
				this.getView().addDependent(this._oVersionVHDialog);
			}
			this._oVersionVHDialog.open();
		},
		handleValueHelpCoa: async function (oEvent) {
			this._vhField = oEvent.getSource();
			if (!this._oCoaVHDialog) {
				this._oCoaVHDialog = await Fragment.load({
					id: this.getView().getId(),
					name: "com.bpcfn.jobscheduler.fragments.coaValueHelp",
					controller: this
				});
				this.getView().addDependent(this._oCoaVHDialog);
			}
			this._oCoaVHDialog.open();
		},
		handleValueHelpGroup: async function (oEvent) {
			this._vhField = oEvent.getSource();
			if (!this._oGroupVHDialog) {
				this._oGroupVHDialog = await Fragment.load({
					id: this.getView().getId(),
					name: "com.bpcfn.jobscheduler.fragments.groupValueHelp",
					controller: this
				});
				this.getView().addDependent(this._oGroupVHDialog);
			}
			this._oGroupVHDialog.open();
		},
		/* ==================================================================
		 *  Layer 1 - format validation on the field itself
		 * ================================================================== */

		/**
		 * fc_year is NUMC(4). Anything else cannot be a fiscal year, and
		 * catching it here beats finding out when the job runs.
		 */
		onFiscalYearChange: function (oEvent) {
			const oInput = oEvent.getSource();
			const sVal = (oEvent.getParameter("value") || "").trim();
			const bOk = sVal === "" || /^\d{4}$/.test(sVal);
			oInput.setValueState(bOk ? "None" : "Error");
			oInput.setValueStateText(this.i18nModel.getText("FiscalYearFormat"));
			this._onScopeFieldChange();
		},

		/**
		 * fc_period is NUMC(3). 1-16 covers normal plus special periods -
		 * TF325 shows formulas up to 16.
		 *
		 * NOTE this is a FORMAT check only. Whether the period is actually
		 * open, and whether it falls in a period category assigned to this
		 * version, are backend questions - see the Check button item in the
		 * backlog.
		 */
		onPeriodChange: function (oEvent) {
			const oInput = oEvent.getSource();
			const sVal = (oEvent.getParameter("value") || "").trim();
			const iVal = parseInt(sVal, 10);
			const bOk = sVal === "" ||
				(/^\d{1,3}$/.test(sVal) && iVal >= 1 && iVal <= 16);
			oInput.setValueState(bOk ? "None" : "Error");
			oInput.setValueStateText(this.i18nModel.getText("PeriodFormat"));
			this._onScopeFieldChange();
		},

		/* ==================================================================
		 *  Layer 2 - con unit help scoped to group + period
		 * ================================================================== */

		/**
		 * Any change to version / group / year / period invalidates the con
		 * unit list, because VH_ConUnit is parameterised on all four.
		 * Tokens already picked are cleared - silently keeping a unit that
		 * is no longer valid for the new scope is worse than making the user
		 * re-pick.
		 */
		_onScopeFieldChange: function () {
			// The group list is period-dependent too, so reload it whenever
			// the scope moves. Fire and forget - the field stays usable while
			// it refreshes.
			this.filterConsGrp();

			const oMulti = this.byId("idUnit");
			if (oMulti && oMulti.getTokens().length) {
				oMulti.removeAllTokens();
				this.getView().getModel("schdMod").setProperty("/ConsUnitTokens", []);
			}

			// Tasks are now SEQUENCED by period category (derived from
			// year+period). If FY/period change, previously-selected tasks
			// belong to the OLD category and their sequence is no longer valid,
			// so clear them - the user re-picks against the new period's list.
			const oTasks = this.byId("idJobTasks");
			if (oTasks && oTasks.getTokens().length) {
				oTasks.removeAllTokens();
				this.getView().getModel("schdMod").setProperty("/TaskTokens", []);
				this.selTaskModel.setData({ results: [] });
				if (this.selTasks) { this.selTasks = []; }
			}
		},

		/**
		 * Filters for VH_ConUnit.
		 *
		 * The view resolves the method-assignment / group-structure OR into
		 * a single EffectiveFrom..EffectiveTo window, so the period test is
		 * two plain comparisons rather than a nested OR - and there are no
		 * NULLs to trip over.
		 *
		 * Returns null when the scope is incomplete, so the caller can say
		 * what is missing instead of firing a request that cannot work.
		 */
		/**
		 * Map a consolidation version to the STRUCTURE version whose group
		 * structure (FINCS_GRPSTR) it uses. GRR is configured to share GRI's
		 * structure, so its structure rows live under strvs = 'GRI'.
		 *
		 * The value-help views filter on strvs, so the version passed to them
		 * must be the STRUCTURE version, not the consolidation version. This
		 * is the single place that knowledge lives - the CDS views stay plain
		 * strvs queries, and adding another shared version later is one line
		 * here, not a change across three views.
		 *
		 * TODO(backend): once a version->structure mapping table/CDS is
		 * confirmed, replace this static map with a read so it is not
		 * maintained in the UI. Until then this is the one hardcoded spot,
		 * deliberately isolated.
		 */
		/**
		 * Pass-through. The GRR->GRI (RVERS->STRVS) resolution now lives in
		 * the data: /BPCFN/BV_XB_GRPSTR joins TF200, so VH_ConGroup / VH_ConUnit
		 * accept the CONSOLIDATION version directly and return the shared
		 * structure. Kept as a seam in case a UI-side override is ever needed,
		 * but it no longer maps - config drives it.
		 */
		_structureVersion: function (sConsolVersion) {
			return sConsolVersion;
		},

		_getConUnitFilters: function () {
			const oData = this.getView().getModel("schdMod").getData();
			const sVersion = this._structureVersion((oData.version || "").trim());
			const sCongr = (oData.con_grp || "").trim();
			const sYear = (oData.fc_year || "").trim();
			const sPeriod = (oData.fc_period || "").trim();

			if (!sVersion || !sCongr || !sYear || !sPeriod) {
				return null;
			}

			// FROMYEARPER / TOYEARPER are stored as YYYY + PPP ('2025001'),
			// so both halves must be padded to their DDIC width - an
			// unpadded '20251' compares as a smaller string and silently
			// matches nothing.
			const sYearPer = String(sYear).padStart(4, "0") +
			                 String(sPeriod).padStart(3, "0");

			return [
				new Filter("Dimen", FilterOperator.EQ, this._sDimen),
				new Filter("Version", FilterOperator.EQ, sVersion),
				new Filter("ConsolidationGroup", FilterOperator.EQ, sCongr),
				new Filter("EffectiveFrom", FilterOperator.LE, sYearPer),
				new Filter("EffectiveTo", FilterOperator.GE, sYearPer)
			];
		},

		_sDimen: "Y1",

	_wireUnitValidator: function () {
		var oMulti = this.byId("idUnit");
		if (!oMulti || oMulti._grUnitValidatorSet) { return; }
		oMulti._grUnitValidatorSet = true;
		var that = this;
		// A typed value becomes a token ONLY if it is a valid unit for the
		// current scope; invalid -> no token + error, so a mistyped unit can
		// never silently fall through to "whole group".
		oMulti.addValidator(function (oArgs) {
			var sText = (oArgs.text || "").trim().toUpperCase();
			if (!sText) { return null; }
			// ASYNC validation uses oArgs.asyncCallback (NOT a returned Promise -
			// MultiInput ignores a Promise, which is why typing did nothing).
			// Return the pending marker so the control waits for the callback.
			that._getValidUnits().then(function (oSet) {
				if (oSet.has(sText)) {
					oMulti.setValueState("None");
					oArgs.asyncCallback(new Token({ key: sText, text: sText }));
				} else {
					oMulti.setValueState("Error");
					oMulti.setValueStateText(that.i18nModel.getText("InvalidConUnit", [sText]));
					oArgs.asyncCallback(null);   // reject: no token
				}
			});
			return sap.m.MultiInput.WaitForAsyncValidation;
		});
	},

	_getValidUnits: async function () {
		var oModel = this.getOwnerComponent().getModel("custModel");
		var aFilters = this._getConUnitFilters();
		if (!aFilters || !aFilters.length) { return new Set(); }
		try {
			var oBinding = oModel.bindList("/VH_ConUnit", undefined, undefined, aFilters,
				{ $$groupId: "$direct" });
			var aCtx = await oBinding.requestContexts(0, 9999);
			var oSet = new Set();
			aCtx.forEach(function (c) {
				var u = c.getObject().ConUnit;
				if (u) { oSet.add(String(u).toUpperCase()); }
			});
			return oSet;
		} catch (e) {
			return new Set();
		}
	},

	handleValueHelpUnit: async function (oEvent) {
		const aFilters = this._getConUnitFilters();
		if (!aFilters) {
			MessageBox.information(this.i18nModel.getText("ConUnitScopeMissing"));
			return;
		}

		this._vhField = oEvent.getSource();
		this.busyDialog.open();

		try {
			const oBinding = this.getOwnerComponent().getModel("custModel")
				.bindList("/VH_ConUnit", undefined, undefined, aFilters, {
					$$groupId: "$direct"
				});
			const aCtx = await oBinding.requestContexts(0, 9999);

			// De-duplicate by ConUnit: the view returns one row per
			// method-assignment period, so a unit can repeat.
			const oSeen = {};
			const aUnits = [];
			aCtx.forEach(function (oCtx) {
				const oRow = oCtx.getObject();
				if (oRow.ConUnit && !oSeen[oRow.ConUnit]) {
					oSeen[oRow.ConUnit] = true;
					aUnits.push({ ConUnit: oRow.ConUnit,
								ConUnitText: oRow.ConUnitText || "" });
				}
			});
			aUnits.sort(function (a, b) {
				return a.ConUnit.localeCompare(b.ConUnit);
			});

			// JSONModel caps list bindings at 100 by default.
			const oVHModel = new JSONModel({ units: aUnits });
			oVHModel.setSizeLimit(aUnits.length || 100);

			// Close busy BEFORE opening the dialog - two popups contending
			// for the stack can leave the second rendered but empty.
			this.busyDialog.close();

			if (!this._oUnitVHDialog) {
				this._oUnitVHDialog = await Fragment.load({
					id: this.getView().getId(),
					name: "com.bpcfn.jobscheduler.fragments.unitMultiInputValueHelp",
					controller: this
				});
				this.getView().addDependent(this._oUnitVHDialog);
			}
			// Refresh the data model on every open so the list stays current.
			this._oUnitVHDialog.setModel(oVHModel, "conUnitVHModel");
			this._oUnitVHDialog.open();

		} catch (oErr) {
			this.busyDialog.close();
			MessageBox.error(this.i18nModel.getText("FailedData"));
		}
	},

		/**
		 * ConsolidationUnitText is keyed by Language + ConsolidationUnit, so
		 * without a filter every unit appears once per maintained language.
		 * OData V2 does not narrow it automatically.
		 */
		_filterUnitTextByLanguage: function (oBinding) {
			if (!oBinding) { return; }
			const sLang = (sap.ui.getCore().getConfiguration().getLanguage() || "en")
				.substring(0, 2).toUpperCase();
			oBinding.filter([new Filter("Language", FilterOperator.EQ, sLang)]);
		},
		onCloseValueHelp: function (oEvent) {
			oEvent.getSource().getParent().getParent().close();
		},
		onBlockChange: function () {
			const blockStatus = this.getView().getModel("schdMod").getProperty("/block_unblock");
			const matchedTasks = this.selTaskModel.getData().results;
			this.rujVisibility(matchedTasks, blockStatus);
			this.firstStepValidation(false);
		},
		rujVisibility: function (matchedTasks, blockStatus) {
			const schdMod = this.getView().getModel("schdMod");
			if (blockStatus === "") {
				for (var j in matchedTasks) {
					if (matchedTasks[j].Cacti === "1015") {
						schdMod.setProperty("/RepTypeVisible", true);
						break;
					} else {
						schdMod.setProperty("/RepTypeVisible", false);
					}
				}
			} else {
				schdMod.setProperty("/RepTypeVisible", false);
			}
			schdMod.refresh(true);
		},
		/**
		 * Open task(s) (ODM/OCM) first, close task(s) (CDM/CCM) last, the rest
		 * in their given order. Stable partition so the middle keeps the user's
		 * arrangement. Used for the display table; the submit does the same so
		 * the two never disagree.
		 */
		_isOpenRow:  function (r) { const i = r.task_id || r.Cacti; return i === "ODM" || i === "OCM"; },
		_isCloseRow: function (r) { const i = r.task_id || r.Cacti; return i === "CDM" || i === "CCM"; },
		_isMonitorRow: function (r) { return this._isOpenRow(r) || this._isCloseRow(r); },

		_pinMonitorOrder: function (aTasks) {
			const idOf = function (t) { return t.task_id || t.Cacti; };
			const isOpen  = function (t) { const i = idOf(t); return i === "ODM" || i === "OCM"; };
			const isClose = function (t) { const i = idOf(t); return i === "CDM" || i === "CCM"; };
			const aOpen   = aTasks.filter(isOpen);
			const aClose  = aTasks.filter(isClose);
			const aMiddle = aTasks.filter(function (t) { return !isOpen(t) && !isClose(t); });
			return aOpen.concat(aMiddle, aClose);
		},

		onTaskUpdated: function (oEvent) {
			var updateType = oEvent.getParameter("type");
			if (updateType === "added") {
				var aAddedTokens = oEvent.getParameter("addedTokens");
				if (aAddedTokens && aAddedTokens.length) {
					aAddedTokens.forEach(function (item) {
						this.selTasks.push({ key: item.getKey(), text: item.getKey() });
					}.bind(this));
					this.getView().getModel("schdMod").setProperty("/TaskTokens", this.selTasks);
				}
			} else {
				const aRemovedTokens = oEvent.getParameter("removedTokens") || [];
				const oModel = this.getView().getModel("schdMod");
				const aSelected = oModel.getProperty("/TaskTokens") || [];

				// Collect keys from removed tokens
				const aRemovedKeys = aRemovedTokens.map(token => token.getKey());

				// Filter out items whose keys were removed
				const aFiltered = aSelected.filter(item => !aRemovedKeys.includes(item.key));

				// Update the model
				oModel.setProperty("/TaskTokens", aFiltered);
				this.selTasks = aFiltered;
			}
			// Guard: if the VH_TaskGroup read failed, getData() is {} and .results
			// is undefined - that produced "Cannot read properties of undefined".
			var oTaskModel = this.getView().getModel("taskModel");
			var tasksData = (oTaskModel && oTaskModel.getData() && oTaskModel.getData().results) || [];
			var selTokens = oEvent.getSource().getTokens();
			var keys = selTokens.map(num => num.getKey());
			const blockStatus = this.getView().getModel("schdMod").getProperty("/block_unblock");

			// Preserve the USER's ARRANGED sequence.
			//
			// The Selected Tasks TABLE (selTaskModel>/results) is the source of
			// truth for order - the user reorders it with move up/down
			// (onSequenceUp/Down). So on any token change we start from the
			// EXISTING table order, not from tasksData (master-data order) and not
			// from token order - either of those discards the user's manual moves.
			//
			//   - keep existing rows that are still selected, in their table order
			//   - append any newly-added tasks at the end (in the order added)
			//   - drop rows whose task is no longer selected
			var oById = {};
			tasksData.forEach(function (t) { oById[t.Cacti] = t; });

			var aExisting = (this.selTaskModel.getData().results) || [];
			var oKeySet = {};
			keys.forEach(function (k) { oKeySet[k] = true; });

			// 1) existing rows still selected, in their current (arranged) order
			var matchedTasks = aExisting.filter(function (row) {
				return oKeySet[row.task_id || row.Cacti];
			});
			// 2) newly added keys (present in tokens, not already in the table)
			var oHave = {};
			matchedTasks.forEach(function (row) { oHave[row.task_id || row.Cacti] = true; });
			keys.forEach(function (k) {
				if (!oHave[k] && oById[k]) {
					matchedTasks.push(Object.assign({}, oById[k]));
				}
			});

			// Pin the monitor lifecycle in the DISPLAY too: open task (ODM/OCM)
			// always FIRST, close task (CDM/CCM) always LAST, the rest in the
			// user's arranged order in between. Same rule the submit enforces -
			// applied here so what the user sees matches what runs, and a task
			// added in a later selection cannot land after the close task.
			matchedTasks = this._pinMonitorOrder(matchedTasks);

			matchedTasks.forEach((task, index) => {
				task.seqno = index + 1;
				task.task_id = task.Cacti || task.task_id;
				task.task_desc = task.Text || task.task_desc;   // VH_TaskGroup text = "Text"
			});

			this.rujVisibility(matchedTasks, blockStatus);
			this.selTaskModel.setData({ results: matchedTasks });
			this.getView().setModel(this.selTaskModel, "selTaskModel");
			this.selTaskModel.refresh(true);
			this.firstStepValidation(true);
		},
		onSequenceUp: function (oEvent) {
			var tasksTable = this.tasksTable;
			var tasksModel = this.getView().getModel("selTaskModel")
			var oSelectedItem = tasksTable.getSelectedItem();
			if (!oSelectedItem) return;

			var iIndex = tasksTable.indexOfItem(oSelectedItem);
			var aRows = tasksModel.getProperty("/results");
			// Keep the monitor lifecycle intact: an open task cannot be moved,
			// and nothing can move ABOVE an open task sitting at the top.
			if (iIndex > 0 && !this._isMonitorRow(aRows[iIndex])
				&& !this._isOpenRow(aRows[iIndex - 1])) {
				[aRows[iIndex - 1], aRows[iIndex]] = [aRows[iIndex], aRows[iIndex - 1]];
				aRows[iIndex - 1].seqno = aRows[iIndex - 1].seqno - 1;
				aRows[iIndex].seqno = aRows[iIndex].seqno + 1;
				tasksModel.refresh(true);
				tasksTable.setSelectedItem(tasksTable.getItems()[iIndex - 1]);
			}
		},
		onSequenceDown: function (oEvent) {
			var tasksTable = this.tasksTable;
			var tasksModel = this.getView().getModel("selTaskModel")
			var oSelectedItem = tasksTable.getSelectedItem();
			if (!oSelectedItem) return;

			var iIndex = tasksTable.indexOfItem(oSelectedItem);
			var aRows = tasksModel.getProperty("/results");
			// A close task cannot be moved, and nothing can move BELOW a close
			// task sitting at the bottom.
			if (iIndex < aRows.length - 1 && !this._isMonitorRow(aRows[iIndex])
				&& !this._isCloseRow(aRows[iIndex + 1])) {
				[aRows[iIndex], aRows[iIndex + 1]] = [aRows[iIndex + 1], aRows[iIndex]];
				aRows[iIndex].seqno = aRows[iIndex].seqno - 1;
				aRows[iIndex + 1].seqno = aRows[iIndex].seqno + 1;
				tasksModel.refresh(true);
				tasksTable.setSelectedItem(tasksTable.getItems()[iIndex + 1]);
			}
		},

		onTaskSelected: function (oEvent) {
			var oDialog = oEvent.getSource().getParent().getParent();
			var table = this.byId("idTaskVHTable");
			const oItem = table.getSelectedItems();

			this.selTasks = [];
			oItem.forEach(function (item) {
				this.selTasks.push({
					key: item.getBindingContext("taskModel").getObject().Cacti,
					text: item.getBindingContext("taskModel").getObject().Cacti
				});
			}.bind(this));
			this.getView().getModel("schdMod").setProperty("/TaskTokens", this.selTasks);
			this.jobTasks.fireTokenUpdate();
			oDialog.close();
		},
		onStartImmSelctd: function (oEvent) {
			var startImmSelctd = oEvent.getParameter("selected");
			var oDateFmt = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd.MM.yyyy" });
			var oTimeFmt = sap.ui.core.format.DateFormat.getTimeInstance({ pattern: "HH:mm:ss" });
			var oNow = new Date();
			this.getView().getModel("schdMod").setProperty("/SchDate", oDateFmt.format(oNow));
			this.getView().getModel("schdMod").setProperty("/SchTime", oTimeFmt.format(oNow));
			this.getView().getModel("schdMod").setProperty("/start_immed", startImmSelctd ? "X" : "");
			this.onSelectionChangeTimeZone();
			this.secondStepValidation();
		},
		onRecrSel: function (oEvent) {
			var sKey = oEvent.getParameter("selectedItem").getKey();
			this.getView().getModel("schdMod").setProperty("/prd_days", sKey);
			var oDateFmt = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd.MM.yyyy" });
			var oTimeFmt = sap.ui.core.format.DateFormat.getTimeInstance({ pattern: "HH:mm:ss" });
			var oNow = new Date();
			if (sKey) {
				this.getView().getModel("schdMod").setProperty("/SchEndDt", oDateFmt.format(oNow));
				this.getView().getModel("schdMod").setProperty("/SchEndTime", oTimeFmt.format(oNow));
				var sCombined = oDateFmt.format(oNow) + ", " + oTimeFmt.format(oNow);
				this.getView().getModel("schdMod").setProperty("/end_date_time", sCombined);
			}
			this._updateOnFieldVisibility(sKey);
		},
		onSearchTimeZone: function (oEvent) {
			const value = oEvent.getParameter("newValue");
			const bindingItems = oEvent.getSource().getParent().getParent().getAggregation("content")[0].getBinding("items");
			const filter = new Filter("Description", FilterOperator.Contains, value);
			bindingItems.filter([filter]);
		},
		readTimeZone: function () {
			this.busyDialog.open();
			const filter = [];
			filter.push(new Filter("Description", FilterOperator.NotContains, "obsolete"));
			const oModel = this.getOwnerComponent().getModel("standardModel");
			return new Promise((resolve, reject) => {
				oModel.read("/TimeZoneSet", {
					filters: filter,
					success: function (oData) {
						const timeZoneModel = new JSONModel();
						timeZoneModel.setData(oData && oData.results ? oData.results : []);
						this.getView().setModel(timeZoneModel, "timeZoneModel");
						this.busyDialog.close();
						resolve();
					}.bind(this),
					error: function (error) {
						this.busyDialog.close();
						reject(error);
					}.bind(this)
				});
			});
		},
		onTimeZoneValueHelp: async function () {
			if (!this._oTimeZoneVHDialog) {
				this._oTimeZoneVHDialog = await Fragment.load({
					id: this.getView().getId(),
					name: "com.bpcfn.jobscheduler.fragments.timeZone",
					controller: this
				});
				this.getView().addDependent(this._oTimeZoneVHDialog);
			}
			this._oTimeZoneVHDialog.open();
		},
		onChangeSchEndDate: function (oEvent) {
			this.onSelectionChangeTimeZone();
		},
		onSelectionChangeTimeZone: async function (oEvent) {
			var oMod = this.getView().getModel("schdMod");
			var selStTime = this._combineDateAndTime(oMod.getProperty("/SchDate"), oMod.getProperty("/SchTime"));
			var selEndTime = this._combineDateAndTime(oMod.getProperty("/SchEndDt"), oMod.getProperty("/SchEndTime"));
			var selTimeZone;
			if (oEvent) {
				this.evtSrc = oEvent.getSource();
				selTimeZone = oEvent.getParameter("listItem").getProperty("description");
				oMod.setProperty("/scheduling_timezone", selTimeZone);
			} else {
				selTimeZone = oMod.getProperty("/scheduling_timezone");
			}
			await this.convertTime(selStTime, "/start_date_time", selTimeZone);
			await this.convertTime(selEndTime, "/end_date_time", selTimeZone);
		},
		convertTime: async function (selTime, property, selTimeZone) {
			// Split date and time
			if (selTime) {
				var parts = selTime.split(", ");
				var dateParts = parts[0].split(".");
				var timeParts = parts[1].split(":");

				// Construct ISO string
				this.isoDate = dateParts[2] + "-" + dateParts[1] + "-" + dateParts[0] + "T" +
					timeParts[0] + ":" + timeParts[1] + ":" + timeParts[2];
				this.busyDialog.open();
				return new Promise(function (resolve, reject) {
					this.getOwnerComponent().getModel("standardModel").read("/GetTimeZoneForDate", {
						urlParameters: {
							TzCode: "'" + selTimeZone + "'",
							DateTime: "datetime'" + this.isoDate + "'"
						},
						success: function (oData) {
							this.busyDialog.close();
							const out = this.formatter.addTimeToIso(this.isoDate, { ms: oData.UtcCalcDifference.ms }, oData.UtcSign);
							const covertedTime = this.formatter.formatDateTimeZone(out);
							this.getView().getModel("schdMod").setProperty(property, covertedTime);
							resolve();
							this.evtSrc?.getParent().close();
						}.bind(this),
						error: function (error) {
							this.busyDialog.close();
							reject();
						}.bind(this)
					});
				}.bind(this));
			}
		},
		onPressCancel: function (oEvent) {
			oEvent.getSource().getParent().close();
		},
		_combineDateAndTime: function (sDate, sTime) {
			if (!sDate) { return ""; }
			return sDate + ", " + (sTime || "00:00:00");
		},
		onChangeSchTime: function () {
			this.onSelectionChangeTimeZone();
		},
		onChangeSchEndTime: function () {
			this.onSelectionChangeTimeZone();
		},
		onRecurrenceIndChanged: function (oEvent) {
			var bSelected = oEvent.getParameter("selected");
			var oMod = this.getView().getModel("schdMod");
			oMod.setProperty("/RecurrenceSetIndicator", bSelected);
			if (!bSelected) {
				oMod.setProperty("/prd_days", "");
				oMod.setProperty("/periodic_value", 0);
				oMod.setProperty("/end_type_c", "");
				oMod.setProperty("/max_iterations", "");
				oMod.setProperty("/SchEndDt", "");
				oMod.setProperty("/SchEndTime", "");
				oMod.setProperty("/end_date_time", "");
				this._updateOnFieldVisibility("");
			} else {
				// The pattern Select visually defaults to "MI" but the model
				// starts empty; seed it now so everyEndFieldVisible returns true
				// and the End row appears immediately without a manual re-select.
				if (!oMod.getProperty("/prd_days")) {
					oMod.setProperty("/prd_days", "MI");
				}
				// Likewise, default end type to "DATE" so the End date/time
				// pickers are visible immediately (byEndByVisible needs DATE + prd_days).
				if (!oMod.getProperty("/end_type_c")) {
					oMod.setProperty("/end_type_c", "DATE");
				}
			}
		},
		_updateOnFieldVisibility: function (sPrdDays) {
			var oMod = this.getView().getModel("schdMod");
			var bShowOn = ["W", "MO"].includes(sPrdDays);
			var bMonthly = sPrdDays === "MO";
			var bWeekly = sPrdDays === "W";
			var sBeginEnd = oMod.getProperty("/BeginEndMonthSelection") || "B";
			var bBegin = sBeginEnd === "B";
			var bEnd = sBeginEnd === "E";
			var bCW = sBeginEnd === "CW";
			oMod.setProperty("/OnFieldVisible", bShowOn);
			// Monthly begin: specific day nr + day type
			oMod.setProperty("/MonthsDayNrVisible", bMonthly && bBegin);
			oMod.setProperty("/MonthsDayTypeVisible", bMonthly && bBegin);
			// Monthly end: negative day nr + days type
			oMod.setProperty("/MonthsNegDayNrVisible", bMonthly && bEnd);
			oMod.setProperty("/MonthsDaysTypeVisible", bMonthly && bEnd);
			// Monthly certain weekday: week ordinal (First–Last) + weekday
			oMod.setProperty("/MonthWeekCodeVisible", bMonthly && bCW);
			oMod.setProperty("/MonthWeekdayVisible", bMonthly && bCW);
			// Weekly: weekday multi-select
			oMod.setProperty("/WeeksDaySelectionVisible", bWeekly);
		},
		onBeginEndMonthSelectionChange: function (oEvent) {
			var sKey = oEvent.getParameter("selectedItem").getKey();
			this.getView().getModel("schdMod").setProperty("/BeginEndMonthSelection", sKey);
			var sPrdDays = this.getView().getModel("schdMod").getProperty("/prd_days");
			this._updateOnFieldVisibility(sPrdDays);
		},
		onMonthDaySelectionChange: function (oEvent) {
			this.getView().getModel("schdMod").setProperty("/MonthDay",
				oEvent.getParameter("selectedItem").getKey());
		},
		onMonthsDayTypeSelectionChange: function (oEvent) {
			var sSrcId = oEvent.getSource().getId();
			var sKey = oEvent.getParameter("selectedItem").getKey();
			// monthsDayTypeSelectionddlb sets MonthsDayType; monthsDaysTypeSelectionddlb sets MonthsDaysType
			if (sSrcId.indexOf("monthsDaysType") !== -1) {
				this.getView().getModel("schdMod").setProperty("/MonthsDaysType", sKey);
			} else {
				this.getView().getModel("schdMod").setProperty("/MonthsDayType", sKey);
			}
		},
		onWeekNumberChange: function (oEvent) {
			this.getView().getModel("schdMod").setProperty("/WeekNumber",
				oEvent.getParameter("selectedItem").getKey());
		},
		onMonthWeekdayChange: function (oEvent) {
			this.getView().getModel("schdMod").setProperty("/MonthWeekDay",
				oEvent.getParameter("selectedItem").getKey());
		},
		onWeeksDaySelectionFinish: function (oEvent) {
			var aKeys = oEvent.getParameter("selectedItems").map(function (oItem) {
				return oItem.getKey();
			});
			this.getView().getModel("schdMod").setProperty("/WeekDays", aKeys);
		},
		onEndTypeCChange: function (oEvent) {
			this.getView().getModel("schdMod").setProperty("/end_type_c",
				oEvent.getParameter("selectedItem").getKey());
		},
		onWorkdayIndChanged: function (oEvent) {
			var bChecked = oEvent.getParameter("selected");
			var oMod = this.getView().getModel("schdMod");
			oMod.setProperty("/MonthOnlyWorkdaysInd", bChecked);
			oMod.setProperty("/StartRestrictionCodeEnabled", bChecked);
			oMod.setProperty("/CalendarSelectionEnabled", bChecked);
			if (!bChecked) {
				oMod.setProperty("/StartRestrictionCode", "A");
				oMod.setProperty("/CalendarId", "");
			}
		},
		onStartRestrictionSelect: function (oEvent) {
			this.getView().getModel("schdMod").setProperty("/StartRestrictionCode",
				oEvent.getParameter("selectedItem").getKey());
		},
		onCalendarSelectionChange: function (oEvent) {
			this.getView().getModel("schdMod").setProperty("/CalendarId",
				oEvent.getParameter("selectedItem").getKey());
		},
		onPressReset: function () {
			var oMod = this.getView().getModel("schdMod");
			oMod.setProperty("/RecurrenceSetIndicator", false);
			oMod.setProperty("/prd_days", "");
			oMod.setProperty("/periodic_value", 0);
			oMod.setProperty("/end_type_c", "");
			oMod.setProperty("/max_iterations", "");
			oMod.setProperty("/SchEndDt", "");
			oMod.setProperty("/SchEndTime", "");
			oMod.setProperty("/end_date_time", "");
			oMod.setProperty("/BeginEndMonthSelection", "B");
			oMod.setProperty("/MonthDay", "1");
			oMod.setProperty("/MonthsDayType", "D");
			oMod.setProperty("/MonthsDaysType", "D");
			oMod.setProperty("/WeekNumber", "W1");
			oMod.setProperty("/MonthWeekDay", "D1");
			oMod.setProperty("/WeekDays", []);
			oMod.setProperty("/MonthOnlyWorkdaysInd", false);
			oMod.setProperty("/StartRestrictionCode", "A");
			oMod.setProperty("/StartRestrictionCodeEnabled", false);
			oMod.setProperty("/CalendarId", "");
			oMod.setProperty("/CalendarSelectionEnabled", false);
			this._updateOnFieldVisibility("");
		},
		/**
		 * Read the consolidation group value help.
		 *
		 * VH_ConGroup no longer carries Version - it now reads from
		 * I_CnsldtnGroupAll, which is not version-dependent. Filtering on a
		 * Version element that no longer exists would fail client-side in the
		 * V4 model with "Type cannot be determined, no metadata for path
		 * /VH_ConGroup/Version", so the filter is gone.
		 *
		 * Consequence: the group list is now the same for every version. The
		 * calls to this function from the version-change handlers are kept
		 * (harmless, and they refresh the list) but no longer narrow anything.
		 */
		/**
		 * Load the consolidation group help, scoped to the chosen version
		 * and period.
		 *
		 * VH_ConGroup now aggregates FINCS_GRPSTR per group and exposes
		 * EffectiveFrom / EffectiveTo, so the period test is two plain
		 * comparisons - the same shape as the con unit help.
		 *
		 * Version alone is not enough: a group can exist for a version but
		 * not yet (or no longer) at the period being scheduled.
		 *
		 * With no version or period chosen the list is loaded unfiltered
		 * rather than left empty, so the field is still usable when the
		 * user fills the wizard out of order.
		 */
		filterConsGrp: async function () {
			try {
				const oData = this.getView().getModel("schdMod").getData();
				const sVersion = this._structureVersion((oData.version || "").trim());
				const sYear = (oData.fc_year || "").trim();
				const sPeriod = (oData.fc_period || "").trim();

				const aFilters = [ new Filter("Dimen", FilterOperator.EQ, this._sDimen) ];

				if (sVersion) {
					aFilters.push(new Filter("Version", FilterOperator.EQ, sVersion));
				}

				if (sYear && sPeriod) {
					// FROMYEARPER / TOYEARPER are YYYY + PPP ('2025001'); both
					// halves must be padded or the string comparison silently
					// matches nothing.
					const sYearPer = String(sYear).padStart(4, "0") +
					                 String(sPeriod).padStart(3, "0");
					aFilters.push(new Filter("EffectiveFrom", FilterOperator.LE, sYearPer));
					aFilters.push(new Filter("EffectiveTo", FilterOperator.GE, sYearPer));
				}

				const oModel = this.getOwnerComponent().getModel("custModel");
				const oListBinding = oModel.bindList("/VH_ConGroup", undefined, undefined, aFilters,
													{ $$groupId: "$direct" });
				this.busyDialog.open();
				const aContexts = await oListBinding.requestContexts(0, 99999);
				this.busyDialog.close();
				const aData = aContexts.map(ctx => ctx.getObject());
				this.getView().getModel("consGrpModel").setData({ results: aData });
			} catch (error) {
				this.busyDialog.close();
				MessageBox.error(this.i18nModel.getText("FailedData"));
			}
		},
		//Suggestion selection from Cons Version
		onSuggItemSelConsVer: async function () {
			this.filterF4Tasks(undefined, this.getView().getModel("schdMod").getProperty("/task_type"));
			await this.filterConsGrp();
		},
		//Selection event for F4 Helps
		onVHItemSelect: async function (oEvent) {
			const oItem = oEvent.getParameter("listItem");
			const aCells = oItem.getCells();
			if (aCells && aCells[0]) {
				const sKey = aCells[0].getText();
				// A MultiInput (CM multi-group) collects tokens; an Input takes
				// a single value. Branch on the control type.
				if (this._vhField && this._vhField.isA && this._vhField.isA("sap.m.MultiInput")) {
					const bDup = this._vhField.getTokens().some(function (t) { return t.getKey() === sKey; });
					if (!bDup) {
						this._vhField.addToken(new Token({ key: sKey, text: sKey }));
						this._syncConsGrpTokens();
					}
				} else if (this._vhField.setSelectedKey) {
					this._vhField.setSelectedKey(sKey);
				} else if (this._vhField.setValue) {
					this._vhField.setValue(sKey);
				}
			}
			const eventSrc = oEvent.getSource().getBindingInfo("items").path;
			if (eventSrc === "/VH_Version") {
				this.filterF4Tasks(undefined, this.getView().getModel("schdMod").getProperty("/task_type"));
				await this.filterConsGrp();
			}
			oEvent.getSource().getParent().getParent().close();
		},
		onAfterRendering: function () {
			// Suggestion list reads the same language-keyed entity set.
			const oUnit = this.byId("idUnit");
			if (oUnit && !this._bUnitLangFiltered) {
				const oBinding = oUnit.getBinding("suggestionItems");
				if (oBinding) {
					this._filterUnitTextByLanguage(oBinding);
					this._bUnitLangFiltered = true;
				}
			}
		},

		/**
		 * CM multi-group tokens changed - keep the schdMod list in step with
		 * the MultiInput so submit can read it.
		 */
		onConsGrpUpdated: function () {
			// let the token aggregation settle, then sync
			setTimeout(this._syncConsGrpTokens.bind(this), 0);
		},

		_syncConsGrpTokens: function () {
			const oMulti = this.byId("idGroupMulti");
			if (!oMulti) { return; }
			const aGroups = oMulti.getTokens().map(function (t) { return t.getKey(); });
			this.getView().getModel("schdMod").setProperty("/ConsGrpTokens",
				aGroups.map(function (g) { return { key: g, text: g }; }));
			this._aConsGrps = aGroups;   // plain list for submit
		},

		onConsUnitUpdated: function (oEvent) {
			var updateType = oEvent.getParameter("type");
			if (updateType === "added") {
				var aAddedTokens = oEvent.getParameter("addedTokens");
				if (aAddedTokens && aAddedTokens.length) {
					aAddedTokens.forEach(function (item) {
						this.selConsUnit.push({ key: item.getKey(), text: item.getKey() });
					}.bind(this));
					this.getView().getModel("schdMod").setProperty("/ConsUnitTokens", this.selConsUnit);
				}
			} else {
				const aRemovedTokens = oEvent.getParameter("removedTokens") || [];
				const oModel = this.getView().getModel("schdMod");
				const aSelected = oModel.getProperty("/ConsUnitTokens") || [];

				// Collect keys from removed tokens
				const aRemovedKeys = aRemovedTokens.map(token => token.getKey());

				// Filter out items whose keys were removed
				const aFiltered = aSelected.filter(item => !aRemovedKeys.includes(item.key));

				// Update the model
				oModel.setProperty("/ConsUnitTokens", aFiltered);
				this.selConsUnit = aFiltered;
			}
		},
		onVHUnitSelect: function (oEvent) {
			const aContexts = oEvent.getParameter("selectedContexts") || [];
			const aTokens = aContexts.map(function (oCtx) {
				const sUnit = oCtx.getObject().ConUnit;
				return { key: sUnit, text: sUnit };
			});
			this.getView().getModel("schdMod").setProperty("/ConsUnitTokens", aTokens);

			// reflect the choice on the MultiInput itself
			const oMulti = this.byId("idUnit");
			if (oMulti) {
				oMulti.removeAllTokens();
				aTokens.forEach(function (t) {
					oMulti.addToken(new Token({ key: t.key, text: t.text }));
				});
			}
		},
		//Search filters for F4 Helps
		onVHTaskSearch: function (oEvent) {
			const sQuery = oEvent.getParameter("newValue");
			const oTable = oEvent.getSource().getParent().getAggregation("items")[1];
			const oBinding = oTable.getBinding("items");

			if (oBinding) {
				const aFilters = [];
				if (sQuery) {
					const id = new Filter("Cacti", FilterOperator.Contains, sQuery);
					const name = new Filter("Text", FilterOperator.Contains, sQuery);
					aFilters.push(new Filter({ filters: [id, name], and: false }))
				}
				oBinding.filter(aFilters.length ? aFilters : [])
			}
		},
		onVHVersionSearch: function (oEvent) {
			const sQuery = oEvent.getParameter("newValue");
			const oTable = oEvent.getSource().getParent().getAggregation("items")[1];
			const oBinding = oTable.getBinding("items");

			if (oBinding) {
				const aFilters = [];
				if (sQuery) {
					const id = new Filter("Version", FilterOperator.Contains, sQuery);
					const name = new Filter("VersionName", FilterOperator.Contains, sQuery);
					aFilters.push(new Filter({ filters: [id, name], and: false }))
				}
				oBinding.filter(aFilters.length ? aFilters : [])
			}
		},
		onVHCOASearch: function (oEvent) {
			const sQuery = oEvent.getParameter("newValue");
			const oTable = oEvent.getSource().getParent().getAggregation("items")[1];
			const oBinding = oTable.getBinding("items");

			if (oBinding) {
				const aFilters = [];
				if (sQuery) {
					const id = new Filter("Coa", FilterOperator.Contains, sQuery);
					const name = new Filter("CoaText", FilterOperator.Contains, sQuery);
					aFilters.push(new Filter({ filters: [id, name], and: false }))
				}
				oBinding.filter(aFilters.length ? aFilters : [])
			}
		},
		onVHConsGrpSearch: function (oEvent) {
			const sQuery = oEvent.getParameter("newValue");
			const oTable = oEvent.getSource().getParent().getAggregation("items")[1];
			const oBinding = oTable.getBinding("items");

			if (oBinding) {
				const aFilters = [];
				if (sQuery) {
					const id = new Filter("ConsolGroup", FilterOperator.Contains, sQuery);
					const name = new Filter("ConsolGroupText", FilterOperator.Contains, sQuery);
					aFilters.push(new Filter({ filters: [id, name], and: false }))
				}
				oBinding.filter(aFilters.length ? aFilters : [])
			}
		},
		onVHConsUnitMultiSearch: function (oEvent) {
			const sQuery = oEvent.getParameter("value");
			const oBinding = oEvent.getSource().getBinding("items");
			if (!oBinding) { return; }
			oBinding.filter(sQuery
				? [new Filter({ filters: [
					new Filter("ConUnit", FilterOperator.Contains, sQuery),
					new Filter("ConUnitText", FilterOperator.Contains, sQuery)
				], and: false })]
				: []);
		},
		/**
		 * Frontend GROUP-level period gate. This is a BLOCK, not an advisory.
		 *
		 * Rule (confirmed with functional):
		 *   - If the consolidation group is CLOSED, every unit under it is
		 *     closed, so nothing can run - UNLESS the job itself opens the
		 *     period first. ODM (Open Data Monitor) / OCM (Open Cons Monitor)
		 *     opens the group and its units in the same flow.
		 *   - So: group closed AND no ODM/OCM in the task list  -> BLOCK.
		 *         group closed AND ODM/OCM present              -> allow.
		 *         group open                                    -> allow.
		 *
		 * The ENGINE handles the remaining case (group open, some units
		 * closed) by holding those units - this frontend gate never has to.
		 *
		 * Returns promise<boolean>: true = proceed. Read errors fail-OPEN so a
		 * flaky check cannot block a legitimate schedule; the engine still
		 * enforces at run time.
		 */
		_confirmPeriodOpen: async function (sVersion, sYear, sPeriod, sGroup, sTaskType) {
			if (!sVersion || !sYear || !sPeriod || !sGroup) {
				return true;   // scope incomplete - mandatory check handles it
			}

			// If the job opens the period itself, a closed group is fine.
			if (this._hasOpenTask(sTaskType)) {
				return true;
			}

			try {
				const oModel = this.getOwnerComponent().getModel("custModel");
				const sPath = "/SchedulerReadiness(p_ryear='" +
					String(sYear).padStart(4, "0") + "',p_perid='" +
					String(sPeriod).padStart(3, "0") + "')/Set";
				const aFilters = [
					new Filter("Version",  FilterOperator.EQ, sVersion),
					new Filter("ConGroup", FilterOperator.EQ, sGroup)
				];
				const oBinding = oModel.bindList(sPath, undefined, undefined, aFilters,
					{ $$groupId: "$direct" });
				const aCtx = await oBinding.requestContexts(0, 2);

				// No row, or the relevant flag not open, means the GROUP is closed.
				let bOpen = false;
				if (aCtx.length) {
					const o = aCtx[0].getObject();
					// DmOpen/CmOpen are Edm.Boolean (abap_boolean in the CDS), so the
					// client gives a real JS boolean - NOT the string "X". Coerce with
					// !! so it works whether the field arrives as true, "X", or "true".
					const vFlag = (sTaskType === "CM") ? o.CmOpen : o.DmOpen;
					bOpen = (vFlag === true || vFlag === "X" || vFlag === "true");
				}
				if (bOpen) {
					return true;   // group open - nothing to block
				}

				// group closed AND no open task -> BLOCK with an error, no proceed.
				const sMonitor = (sTaskType === "CM")
					? this.i18nModel.getText("MonitorCM")
					: this.i18nModel.getText("MonitorDM");
				const sOpenTask = (sTaskType === "CM") ? "OCM" : "ODM";
				MessageBox.error(
					this.i18nModel.getText("PeriodClosedBlock", [sMonitor, sGroup, sPeriod, sOpenTask]));
				return false;

			} catch (oErr) {
				return true;   // fail-open; engine enforces
			}
		},

		/**
		 * True if the selected tasks include the open-monitor task that would
		 * open a closed period in this run. ODM for a DM job, OCM for a CM job.
		 */
		_hasOpenTask: function (sTaskType) {
			const sOpen = (sTaskType === "CM") ? "OCM" : "ODM";
			const aTasks = (this.selTaskModel.getData().results) || [];
			return aTasks.some(function (t) {
				return (t.task_id === sOpen) || (t.Cacti === sOpen);
			});
		},

		onScheduleJob: async function (oEvent) {
			let schdMod = this.getView().getModel("schdMod");
			let fiscalYear = schdMod.getData().fc_year;
			let period = schdMod.getData().fc_period;
			let version = schdMod.getData().version;
			let coa = schdMod.getData().coa;
			let consGrp = schdMod.getData().con_grp;
			let consUnit = schdMod.getData().ConsUnitTokens;

			// CON-UNIT VALIDATION (submit backstop): if the user entered ANY
			// units, every one must be valid for the scope. This stops a mistyped
			// unit from being silently dropped so the job runs the WHOLE GROUP.
			// (An empty unit list is legitimate - it means "the whole group".)
			if (consUnit && consUnit.length) {
				const oValid = await this._getValidUnits();
				const aBad = consUnit
					.map(function (t) { return String(t.key).toUpperCase(); })
					.filter(function (k) { return !oValid.has(k); });
				if (aBad.length) {
					MessageBox.error(this.i18nModel.getText("InvalidConUnit", [aBad.join(", ")]));
					return;   // do not schedule with an invalid unit
				}
			}

			// Mandatory-field check.
			//
			// The original test was:
			//   fiscalYear === "" || fiscalYear === undefined || period === "" ||
			//   period === undefined || version === "" || coa === "" || consGrp === ""
			//
			// Two problems with that:
			//  1. version / coa / con_grp were compared to "" only. A ComboBox
			//     that has been opened and cleared leaves null, not "", so a
			//     genuinely empty field slipped through.
			//  2. Nothing was trimmed, so a value of " " counted as filled.
			//
			// Normalising first makes the result the same every time - which is
			// what the intermittent "fill all mandatory fields" came down to:
			// whether a field held "", null or undefined depended on how the
			// user had interacted with it, not on whether it had a value.
			const fnEmpty = function (v) {
				return v === null || v === undefined || String(v).trim() === "";
			};
			const aMandatory = [
				{ value: fiscalYear, label: "Fiscal year" },
				{ value: period,     label: "Period" },
				{ value: version,    label: "Version" },
				{ value: coa,        label: "Consolidation COA" },
				{ value: (schdMod.getData().task_type === "CM" &&
				          this._aConsGrps && this._aConsGrps.length)
					? this._aConsGrps[0]      // CM: at least one group token
					: consGrp,               // DM: the single group field
				  label: "Consolidation Group" }
			];
			const aMissing = aMandatory.filter(function (o) { return fnEmpty(o.value); })
				.map(function (o) { return o.label; });
			this.mandFields = aMissing.length === 0;

			// Re-check the recurrence end condition at submit.
			// validateSchedule also runs from the recurrence dialog's OK
			// button, but the dialog can be dismissed without it, and the
			// failure mode is silent: a periodic job with neither
			// max_iterations nor end_date_time is created successfully and
			// then never repeats.
			const oSchedCheck = this.validateSchedule(schdMod.getData());
			if (!oSchedCheck.ok) {
				MessageBox.error(this.i18nModel.getText(oSchedCheck.message || "upto3Digits"));
				return;
			}

			if (!schdMod.getData().start_immed) {
				if (schdMod.getData().SchDate === "" || schdMod.getData().SchDate === undefined) {
					schdMod.setProperty("/SchDateValueState", "Error");
					MessageBox.error(this.i18nModel.getText("SchDateMand"));
					return;
				} else {
					// NOTE: this used to set this.mandFields = true, overwriting
					// the mandatory-field result computed above. A job with an
					// empty COA or version could be submitted purely because a
					// scheduled start date had been supplied. Only the date's own
					// value state belongs here.
					schdMod.setProperty("/SchDateValueState", "None");
				}
			}

			if (this.mandFields) {
				var selTaskModelData = this.getView().getModel("selTaskModel").getData().results;

				// ENFORCE THE MONITOR LIFECYCLE ORDER.
				//   OPEN  tasks (ODM / OCM)  -> always FIRST  (open the period)
				//   CLOSE tasks (CDM / CCM)  -> always LAST   (close it after all work)
				//   everything else          -> the user's order, in the middle
				//
				// A job is DM or CM, never both, so at most one open (ODM|OCM) and
				// one close (CDM|CCM) exist. seqno below is assigned from array
				// order, so partitioning here IS the enforcement - the engine runs
				// tasks in seqno order, so open-first / close-last is guaranteed
				// regardless of how the user arranged them. Stable partition (not
				// Array.sort) so the middle tasks keep the exact user order.
				(function () {
					const aAll = selTaskModelData || [];
					const idOf = function (t) { return t.Cacti || t.task_id; };
					const isOpen  = function (t) { const i = idOf(t); return i === "ODM" || i === "OCM"; };
					const isClose = function (t) { const i = idOf(t); return i === "CDM" || i === "CCM"; };
					const aOpen   = aAll.filter(isOpen);
					const aClose  = aAll.filter(isClose);
					const aMiddle = aAll.filter(function (t) { return !isOpen(t) && !isClose(t); });
					// open(s) + user-ordered middle + close(s)
					selTaskModelData = aOpen.concat(aMiddle, aClose);
				})();
				var startImmChecked = schdMod.getData().start_immed;
				var startDate, endDate;
				var selTasks = [];
				var today = new Date();
				if (startImmChecked) {
					startDate = new Date();
				} else {
					startDate = this.formatter.parseCustomDate(schdMod.getData().start_date_time);
					if (today.getTime() > startDate.getTime()) {
						this.getView().getModel("schdMod").setProperty("/SchDateValueState", "Error");
						MessageBox.error(this.i18nModel.getText("SchDatePast"));
						return;
					}
				}
				for (var i in selTaskModelData) {
					if (selTaskModelData[i].task_id === "1010" && Number(period) !== 1) {
						MessageBox.error(this.i18nModel.getText("BCFError"));
						return;
					}
					if (selTaskModelData[i].task_id === "ZCOPY" && !schdMod.getData().selected_variant && !schdMod.getData().block_unblock) {
						MessageBox.error(this.i18nModel.getText("VariantMand"));
						return;
					}
					var taskdata = {};
					var taskName = selTaskModelData[i].Cacti === undefined ? selTaskModelData[i].task_id : selTaskModelData[i].Cacti;
					taskdata.seqno = (Number(i) + 1).toString();

					taskdata.task_id = taskName;
					taskdata.task_desc = selTaskModelData[i].Text === undefined ? selTaskModelData[i].task_desc : selTaskModelData[i].Text;
					taskdata.jobname = schdMod.getData().jobname + "_" + taskName;
					// Reporting type flags for task 1015, kept as three separate
					// X/' ' indicators to match the original design.
					//
					// IF THIS THROWS "Property 'auto_flag' is invalid": the fields
					// are on the table but not yet in $metadata. Activate the CDS
					// views, run /IWFND/CACHE_CLEANUP, and re-download $metadata.
					//
					// IF THIS THROWS a type error instead: check how the fields are
					// typed. If they use abap_bool / xsdboolean, RAP exposes them as
					// Edm.Boolean and "X"/"" is rejected - send true/false instead.
					// That is exactly what happened with start_immed, which is
					// Edm.Boolean here but was String(1) on the V2 binding.
					// For a CHAR 1 domain the "X"/"" below is correct.
					if (taskName === "1015") {
						taskdata.auto_flag = schdMod.getData().RepType === 0 ? "X" : "";
						taskdata.complete_flag = schdMod.getData().RepType === 1 ? "X" : "";
						taskdata.delta_flag = schdMod.getData().RepType === 2 ? "X" : "";
					}
					selTasks.push(taskdata);
				}
				//comparing the converted end date time based on the reccurrence pattern selected
				if (schdMod.getData().end_date_time && schdMod.getData().prd_days && schdMod.getData().end_type_c === "DATE") {
					endDate = this.formatter.parseCustomDate(schdMod.getData().end_date_time);
					if (today.getTime() > endDate.getTime()) {
						MessageBox.error(this.i18nModel.getText("EndDtLessThanSyDate"))
						return;
					} else {
						if (startDate.getTime() > endDate.getTime()) {
							MessageBox.error(this.i18nModel.getText("EndDtLessThanStDt"))
							return;
						}
					}
				}

				var consDataData = consUnit.map(function (token) {
					return {
						con_unit: token.key
					};
				});

				var oPayload = {
					"fc_year": fiscalYear,
					"fc_period": period,
					"version": version,
					"coa": coa,
					"con_grp": consGrp,
					"jobname": schdMod.getData().jobname,
					"testmode": schdMod.getData().testmode,
					"sdl_startdt": startDate.toISOString().split('T')[0],
					"sdl_starttm": startDate.toISOString().split('T')[1].slice(0, -5),
					"start_immed": !!startImmChecked,   // Edm.Boolean in V4, not the "X"/"" flag
					"prd_days": schdMod.getData().prd_days,
					"creation_date": new Date().toISOString().split('T')[0],
					"creation_time": new Date().toISOString().split('T')[1].slice(0, -5),
					"task_type": schdMod.getData().task_type,
					"block_unblock": schdMod.getData().block_unblock,
					"generic_user_id": schdMod.getData().generic_user_id,
					"job_rec_count": "1",
					"end_type_c": this._endTypeCode(schdMod.getData().end_type_c),
					// Edm.Decimal(15) ABAP timestamp, Nullable="false" - send "0"
					// when there is no end date. null is rejected outright.
					"end_date_time": this.formatter.toAbapTimestamp(schdMod.getData().end_date_time),
					// Edm.Int32 Nullable="false" - Number(undefined) is NaN, which
					// serialises as null and fails the same way.
					"max_iterations": Number(schdMod.getData().max_iterations) || 0,
					"scheduling_timezone": schdMod.getData().scheduling_timezone, // current timezone 
					"schedule_type_c": startImmChecked ? "I" : "P", // 'I' for immediate and 'P' planned for future date
					"start_date_time": this.formatter.toAbapTimestamp(schdMod.getData().start_date_time),
					"periodic_granularity": schdMod.getData().prd_days,  // MI(Min) , H (hour)
					"periodic_value": Number(schdMod.getData().periodic_value) || 0,
					"selected_variant": schdMod.getData().selected_variant,
					// Navigation properties are case-sensitive and are named
					// "_Tasks" / "_ConUnits" in this V4 service (the /shl/ payload
					// used "_tasks" / "_con_units", which the JSON reader rejects
					// with "Property '_tasks' is invalid").
					"_Tasks": selTasks,
					"_ConUnits": consDataData
				}
				// Every property on SchedulerTask except sdl_startdt and
				// creation_date is Nullable="false", so any null reaching the
				// backend produces "Property '<name>' has invalid value 'null'".
				// Dropping the key instead lets the field take its initial value.
				Object.keys(oPayload).forEach(function (k) {
					var v = oPayload[k];
					if (v === null || v === undefined || (typeof v === "number" && isNaN(v))) {
						delete oPayload[k];
					}
				});

				// ---- period-open advisory (frontend half of the DM/CM gate) ----
				// Warn if the chosen group's monitor is not open for this period.
				// Advisory only: the ENGINE enforces per-unit at run time (holds
				// closed units with reason 'D'). Here we just let the user know
				// before they commit, and let them proceed - they may be scheduling
				// ahead of a planned open.
				// ITEM 3: for Consolidation Monitor the user may pick MULTIPLE
				// groups. con_grp is a header field, so each group becomes its own
				// single-group schedule (Option A - separate GUIDs, no backend
				// change). DM stays single-group.
				let aGroups;
				if (schdMod.getData().task_type === "CM" &&
				    this._aConsGrps && this._aConsGrps.length) {
					aGroups = this._aConsGrps.slice();
				} else {
					aGroups = [ schdMod.getData().con_grp ];
				}

				// Period-open block check PER GROUP. If any group is blocked, stop
				// the whole submit - do not create some and skip others.
				for (let gi = 0; gi < aGroups.length; gi++) {
					const bOk = await this._confirmPeriodOpen(
						schdMod.getData().version,
						schdMod.getData().fc_year,
						schdMod.getData().fc_period,
						aGroups[gi],
						schdMod.getData().task_type);
					if (!bOk) {
						return;   // blocked (or user cancelled) - create nothing
					}
				}

				const oModel = this.getOwnerComponent().getModel("custModel");

				// Create one schedule per group. For a single group this is the
				// original single create(); for several, a loop. The last context
				// drives the success/nav handling below (all share the same
				// tasks/params, differing only in con_grp).
				let tableContext;
				for (let gi = 0; gi < aGroups.length; gi++) {
					const oGrpPayload = { ...oPayload, con_grp: aGroups[gi] };
					const tableListbinding = oModel.bindList("/SchedulerTask");
					tableContext = tableListbinding.create({ ...oGrpPayload });
				}
				sap.ui.getCore().getMessageManager().removeAllMessages();
				this.busyDialog.open();
				tableContext.created().then(function (data) {
					this.busyDialog.close();
					let messages = this.getView().getModel("message").getData();
					const oFirstMessage = messages && messages.length ? messages[0] : null;
					if (oFirstMessage && oFirstMessage.type === "Success") {
						MessageBox.show(
							aGroups.length > 1
								? this.i18nModel.getText("JobsCreatedN", [aGroups.length])
								: this.i18nModel.getText("JobCreated"), {
							icon: sap.m.MessageBox.Icon.SUCCESS,
							title: "Success",
							actions: [sap.m.MessageBox.Action.OK],
							onClose: async function (oAction) {
								if (oAction === sap.m.MessageBox.Action.OK) {
									await this.getOwnerComponent().getRouter().navTo("Home");
									this.clearAllFields();
								}
							}.bind(this)
						});
					} else if (oFirstMessage) {
						this.byId("messageButton").firePress();
					} else {
						// NO MESSAGE AT ALL.
						// created() resolving means the POST succeeded - the record
						// is committed whether or not the backend attached a
						// SAP__Messages entry. The original code had no else here,
						// so a silent success left the user staring at the wizard
						// with the job already created. Treat it as success.
						MessageBox.show(
							aGroups.length > 1
								? this.i18nModel.getText("JobsCreatedN", [aGroups.length])
								: this.i18nModel.getText("JobCreated"), {
							icon: sap.m.MessageBox.Icon.SUCCESS,
							title: "Success",
							actions: [sap.m.MessageBox.Action.OK],
							onClose: async function (oAction) {
								if (oAction === sap.m.MessageBox.Action.OK) {
									await this.getOwnerComponent().getRouter().navTo("Home");
									this.clearAllFields();
								}
							}.bind(this)
						});
					}
				}.bind(this), function (err) {
					this.busyDialog.close();
					var oMessageModel = this.getView().getModel("message");
					var aMessages = oMessageModel && typeof oMessageModel.getData === "function" ? oMessageModel.getData() : null;
					var sErrorMessage = this.i18nModel.getText("unexpErr");
					if (Array.isArray(aMessages) && aMessages.length > 0 && aMessages[0] && aMessages[0].message) {
						sErrorMessage = aMessages[0].message;
					} else if (err && err.message) {
						sErrorMessage = err.message;
					}
					MessageBox.error(sErrorMessage);
				}.bind(this)).catch(function (err) {
					this.busyDialog.close();
					var sErrorMessage = this.i18nModel.getText("unexpErr");
					if (err && err.message) {
						sErrorMessage = err.message;
					}
					MessageBox.error(sErrorMessage);
				}.bind(this));
			}
			else {
				// Name the offending fields - "fill all the mandatory fields" on a
				// four-step wizard leaves the user hunting through every step.
				MessageBox.error(this.i18nModel.getText("MandField"), {
					details: aMissing.length ? ("Missing: " + aMissing.join(", ")) : undefined
				});
			}
		},
		onMessagePopoverPress: function (oEvent) {
			if (!this._oMessagePopover) {
				this._oMessagePopover = new sap.m.MessagePopover({
					items: {
						path: "message>/",
						template: new sap.m.MessageItem({
							type: "{message>type}",
							title: "{message>message}",
							description: "{message>description}"
						})
					}
				});
				this.getView().addDependent(this._oMessagePopover);
			}
			this._oMessagePopover.openBy(oEvent.getSource());
		},
		onCancelJob: function () {
			this.getOwnerComponent().getRouter().navTo("Home");
			this.clearAllFields();
		},
		clearAllFields: function () {
			this.initializeData();
			this.schdMod.setProperty("/TaskTokens", []);
			this.schdMod.setProperty("/schJobBtnVisible", false);
			this.schdMod.setProperty("/RepTypeVisible", false);
			this._wizard.invalidateStep(this.byId("TaskSelStep"));
			this._wizard.invalidateStep(this.byId("SchdOptionStep"));
			this.byId("ParamSelStep").setNextStep(null);
			this._wizard.discardProgress(this._wizard.getSteps()[0]);
		}
	});
});