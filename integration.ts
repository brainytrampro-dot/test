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



********************

  /**
 * DisplayDossierViewComponent (excerpt)
 *
 * This file shows a minimal, complete integration of the action system:
 * - Uses ActionIntegration helper to compute left/right actions and execute them.
 * - Exposes getters used by the template (leftActions/rightActions).
 * - Keeps all existing component methods untouched (handlers like onRequestMoreInfo, onGrantLoan, ...).
 *
 * IMPORTANT:
 * - This is an integration-ready excerpt. Keep your existing methods in the class (I didn't re-include the entire original file).
 * - Adjust import paths if you place the actions files in a different folder.
 */

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';

// Import the helper integration class (file created earlier)
import { ActionIntegration } from './display-dossier.actions.integration';

// If you put actions.* files in a subfolder adjust the imports above accordingly.

@Component({
  selector: 'app-display-dossier-view',
  templateUrl: './index.html' // uses the repo template (we replace actions area in template)
  // styles, providers, etc. as in your original component
})
export class DisplayDossierViewComponent implements OnInit, OnDestroy {
  // DI-provided services that your original component uses (declare the ones required by rules)
  constructor(
    private changeDetectorRef: ChangeDetectorRef,
    // keep your existing injections here: dossierStore, userService, permManager, dossierDataService, router, etc.
    // example:
    // private dossierStore: DossierStore,
    // private userService: UserService,
    // private permManager: PermissionManager,
    // private dossierDataService: DossierDataService,
    // private router: Router
  ) {}

  // the action integration instance (wraps rules evaluation + mapping + execution)
  private actionIntegration!: ActionIntegration;

  // any other subscriptions you already have
  private subs: Subscription[] = [];

  // Example synchronous flag used by rules — update it from observables in the real component
  public hasMandatoryAttachments: boolean | undefined = undefined;

  // --- lifecycle hooks ---
  ngOnInit(): void {
    // existing component init code (keep it)
    // ...

    // create integration and init it (it subscribes to dossierStore.dossierData$ internally)
    this.actionIntegration = new ActionIntegration(this, this.changeDetectorRef);
    this.actionIntegration.init();

    // example: keep a local subscription to an observable you already had
    // if you have hasMandatoryAttachments$ Observable, subscribe and set the boolean:
    // const s = this.someService.hasMandatoryAttachments$.subscribe(v => {
    //   this.hasMandatoryAttachments = v;
    //   // recompute actions when that flag changes
    //   const dossier = this.dossierStore.get();
    //   this.actionIntegration.computeActionsFor(dossier);
    //   this.changeDetectorRef.markForCheck();
    // });
    // this.subs.push(s);
  }

  ngOnDestroy(): void {
    // teardown integration
    if (this.actionIntegration) this.actionIntegration.destroy();

    // teardown other subscriptions
    this.subs.forEach(s => s.unsubscribe());
  }

  // --- Template getters (expose actions to template) ---
  // The template can bind to leftActions/rightActions either directly via actionIntegration.* or via these getters.
  get leftActions() {
    return this.actionIntegration ? this.actionIntegration.leftActions : [];
  }

  get rightActions() {
    return this.actionIntegration ? this.actionIntegration.rightActions : [];
  }

  // --- UI click entrypoint used in template ---
  // Pass the ActionMeta object from template to this method
  public onActionClick(action: any) {
    // delegate to integration handler that maps action -> component method
    this.actionIntegration.onActionClick(action).catch(err => {
      // optional: show global error toast / log
      console.error('Action execution failed', err);
    });
  }

  // ------------------------------------------------------------------
  // IMPORTANT: The component must keep all existing handler methods referenced
  // in handlers.map.ts (for example: onRequestMoreInfo, onGrantLoan, assignToMe, ...)
  // The ActionIntegration will call them by name via the mapping.
  //
  // If any of those methods accept arguments (dossier, taskStatus,...), keep
  // the same signature — ActionIntegration passes dossier or dossier[prop].
  // ------------------------------------------------------------------

  // Example placeholder methods (replace with your real implementations)
  // NOTE: Remove these placeholders if your real methods already exist in this component.

  // public onRequestMoreInfo(dossier?: any) { console.log('onRequestMoreInfo', dossier); }
  // public onGrantLoan() { console.log('onGrantLoan'); }
  // public assignToMe() { console.log('assignToMe'); }
  // ... keep the rest of your existing methods here ...

}


***************************


  <!-- index.html (excerpt)
 Replace the actions / authorizedActions block in your template with this snippet.
 This snippet expects the component to expose leftActions and rightActions (getters above).
 Keep the rest of your original template unchanged.
-->

<!-- ... previous template content ... -->

<!-- ACTIONS UI block (LEFT buttons + RIGHT dropdown) -->
<div class="navigation-container button" *ngIf="dossier.assignedToMe">
  <!-- LEFT actions: direct buttons -->
  <div class="left-actions">
    <ng-container *ngFor="let a of leftActions">
      <button type="button"
              [ngClass]="a.class || 'action-btn'"
              [disabled]="a.disabled"
              (click)="onActionClick(a)">
        <img *ngIf="a.icon" [src]="a.icon" width="15px" alt="ico"/>
        {{ a.labelKey | translate }}
      </button>
    </ng-container>
  </div>

  <!-- RIGHT actions (dropdown) -->
  <div class="right-actions" *ngIf="rightActions?.length > 0">
    <button [matMenuTriggerFor]="actionsMenu" class="action-btn" type="button">{{ 'button.actions.label' | translate }}</button>
    <mat-menu #actionsMenu="matMenu" class="floated-menu-btndossier" hasBackdrop="true" xPosition="before">
      <ul class="floated-menu_list">
        <li class="floated-menu_item" *ngFor="let a of rightActions">
          <button mat-menu-item type="button" (click)="onActionClick(a)" [disabled]="a.disabled">
            <img *ngIf="a.icon" [src]="a.icon" width="15" alt="ico" />
            {{ a.labelKey | translate }}
          </button>
        </li>
      </ul>
    </mat-menu>
  </div>
</div>

<!-- ... following template content ... -->
