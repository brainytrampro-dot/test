/**
 * display-dossier.actions.integration.ts
 *
 * Helper class you can instantiate from DisplayDossierViewComponent to wire
 * ACTIONS + rules evaluation + mapping to existing component methods.
 *
 * How to use (example):
 *  - At top of your component file add:
 *      import { ActionIntegration } from './display-dossier.actions.integration';
 *  - In component class:
 *      private actionIntegration!: ActionIntegration;
 *
 *  - In ngOnInit():
 *      this.actionIntegration = new ActionIntegration(this, this.changeDetectorRef);
 *      this.actionIntegration.init();
 *
 *  - In ngOnDestroy():
 *      this.actionIntegration.destroy();
 *
 * The integration expects the component instance to expose:
 *  - dossierStore with .get() and dossierData$ observable
 *  - permManager (optional) with isGranted(perms)
 *  - userService, dossierDataService, dossierRequestInProgress, isAllAttachmentControlled,
 *    isAllAttachmentControlledOK, hasMandatoryAttachments, currentDossierUser, isProspect
 *  - showReassignMenuTrigger(d) method (optional)
 *  - the component methods mapped in handlers.map.ts (onRequestMoreInfo, onGrantLoan, etc.)
 *  - changeDetectorRef will be used to trigger view updates
 *
 * This file implements:
 *  - computeActionsFor(dossier) using Array.reduce (one pass)
 *  - evaluateRuleDescriptor via actions.rules (imported)
 *  - onActionClick(actionMeta) which calls the mapped method on the component
 *
 * Adapt paths of imports if you put the constants/rules/handlers in a different folder.
 */

import { Subscription } from 'rxjs';
import { ChangeDetectorRef } from '@angular/core';
import { ACTIONS, ActionMeta } from './actions.constants';
import { makeRules, evaluateRuleDescriptor } from './actions.rules';
import { ACTION_TO_METHOD } from './handlers.map';

type ActionWithDisabled = ActionMeta & { disabled: boolean };

/**
 * Adapter that encapsulates action computation and execution for DisplayDossierViewComponent.
 * It holds leftActions and rightActions arrays that the template can bind to.
 */
export class ActionIntegration {
  // Will be populated with visible+computed actions and read by the component template.
  public leftActions: ActionWithDisabled[] = [];
  public rightActions: ActionWithDisabled[] = [];

  private subscription: Subscription | null = null;

  /**
   * component: the DisplayDossierViewComponent instance
   * cdr: ChangeDetectorRef from the component (used to markForCheck)
   */
  constructor(private component: any, private cdr: ChangeDetectorRef) {}

  /**
   * Initialize: subscribe to dossier changes and compute initial actions.
   * Call this from component.ngOnInit()
   */
  public init() {
    // initial compute from snapshot if available
    const initialDossier = this.safeGetDossier();
    this.computeActionsFor(initialDossier);

    // subscribe to dossier observable updates if available
    if (this.component.dossierStore && this.component.dossierStore.dossierData$ && typeof this.component.dossierStore.dossierData$.subscribe === 'function') {
      this.subscription = this.component.dossierStore.dossierData$.subscribe((dossierData: any) => {
        // if component maintains any synchronous flags from observables (hasMandatoryAttachments, etc.)
        // make sure they are updated before computeActionsFor is called.
        this.computeActionsFor(dossierData);
        // mark for check to ensure template updates under OnPush
        try { this.cdr.markForCheck(); } catch (e) { /* ignore */ }
      });
    }
  }

  /**
   * Tear down subscription. Call this from component.ngOnDestroy()
   */
  public destroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  /**
   * Safely get the current dossier snapshot from component.dossierStore.get()
   */
  private safeGetDossier(): any {
    try {
      return this.component.dossierStore?.get?.();
    } catch {
      return undefined;
    }
  }

  /**
   * computeActionsFor - single-pass reduce implementation
   * - Evaluates permissions, visibility and disabled in one pass using reduce.
   * - Populates this.leftActions and this.rightActions
   *
   * Note: visibilityIf / disabledIf are evaluated with evaluateRuleDescriptor using rulesObj produced by makeRules(ctx)
   */
  public computeActionsFor(dossier: any) {
    // Build a minimal rules context from the component state. Update as needed.
    const rulesCtx = {
      userService: this.component.userService,
      permManager: this.component.permManager,
      dossierDataService: this.component.dossierDataService,
      dossierRequestInProgress: this.component.dossierRequestInProgress,
      isAllAttachmentControlled: this.component.isAllAttachmentControlled,
      isAllAttachmentControlledOK: this.component.isAllAttachmentControlledOK,
      hasMandatoryAttachments: this.component.hasMandatoryAttachments, // keep up-to-date in component
      currentDossierUser: this.component.currentDossierUser,
      currentUserCodeProfession: this.component.userService?.currentUserCodeProfession,
      isProspect: this.component.isProspect,
      showReassignMenuTrigger: typeof this.component.showReassignMenuTrigger === 'function' ? this.component.showReassignMenuTrigger.bind(this.component) : undefined
    };

    const rulesObj = makeRules(rulesCtx);

    const initial = { left: [] as ActionWithDisabled[], right: [] as ActionWithDisabled[] };

    const result = ACTIONS.reduce((acc, action) => {
      // permission quick-skip: if action requires perms and permManager exists and user lacks them -> skip
      if (action.permissions?.length && rulesCtx.permManager && typeof rulesCtx.permManager.isGranted === 'function') {
        if (!rulesCtx.permManager.isGranted(action.permissions)) return acc;
      }

      // evaluate visibility; if not visible skip
      const visible = evaluateRuleDescriptor(rulesObj, action.visibilityIf, dossier);
      if (!visible) return acc;

      // evaluate disabled: descriptor true => disabled
      const disabled = !!evaluateRuleDescriptor(rulesObj, action.disabledIf, dossier);

      const item: ActionWithDisabled = { ...action, disabled };

      if (action.group === 'right') acc.right.push(item);
      else acc.left.push(item);

      return acc;
    }, initial);

    // assign results (shallow assign so template bindings update)
    this.leftActions = result.left;
    this.rightActions = result.right;
  }

  /**
   * onActionClick - call the mapped method on the component using ACTION_TO_METHOD
   * Accepts either ActionMeta (from leftActions/rightActions) or action id.
   */
  public async onActionClick(actionMetaOrId: ActionMeta | string) {
    const actionMeta: ActionMeta | undefined = typeof actionMetaOrId === 'string'
      ? ACTIONS.find(a => a.id === actionMetaOrId)
      : actionMetaOrId;

    if (!actionMeta) {
      console.warn('Action not found', actionMetaOrId);
      return;
    }

    // recompute disabled (optional) by re-evaluating descriptor sync — you already computed it in computeActionsFor so skip if you prefer
    // If you want to re-evaluate before executing:
    // const rulesObj = makeRules(...); const isDisabled = evaluateRuleDescriptor(rulesObj, actionMeta.disabledIf, dossier);

    if ((actionMeta as any).disabled) return; // do not execute disabled actions

    const methodName = ACTION_TO_METHOD[actionMeta.actionKey];
    if (!methodName) {
      console.warn('No mapping for actionKey', actionMeta.actionKey);
      return;
    }

    const method = this.component[methodName];
    if (typeof method !== 'function') {
      console.warn('Mapped method not found on component:', methodName);
      return;
    }

    // prepare arg: either dossier or a dossier property (passDossierProp)
    const dossier = this.safeGetDossier();
    const arg = actionMeta.passDossierProp ? dossier?.[actionMeta.passDossierProp] : dossier;

    try {
      const res = method.call(this.component, arg);
      // support Promise-returning methods
      if (res && typeof res.then === 'function') await res;
    } catch (err) {
      console.error('Action execution error for', actionMeta.id, err);
      // keep error handling minimal; component may also listen to failures
    }
  }
}
