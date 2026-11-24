:host ::ng-deep .third-step-level > li.stepper-label:first-child .step-title {
  flex-wrap: wrap;
}

:host ::ng-deep .sub-clients-list {
  flex-basis: 100%;
  width: 100%;
  list-style: none;
  padding-left: 16px;
  margin-top: 8px;
  margin-bottom: 4px;
  border-left: 1px solid #d9d9d9;

  li {
    display: block;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 400;
    color: #6c757d;
    cursor: pointer;
    transition: color 0.2s;

    &:hover,
    &.active {
      font-weight: 600;
      color: #e33550;
    }

    &.completed:not(.active) {
      color: #28a745;
    }
  }
}


@ViewChild('principalStepper') principalStepper!: CdkStepper;
@ViewChild('jointCustomerStepper') jointCustomerStepper?: CdkStepper;



<cdk-step [stepControl]="customerDataFormGroup" [completed]="isStepCompleted(customerDataFormGroup, 0)" [hasError]="isStepHasError(customerDataFormGroup, 0)">
  <ng-template cdkStepLabel>
    <span>{{"customer.loan.initiation.steps.customerdata.label" | translate}}</span>

    <!-- Sous-liste des clients affichée directement sous "Données Client" dans la sidebar -->
    <ul *ngIf="isJointAccount && principalStepper?.selectedIndex === 0" class="sub-clients-list" (click)="$event.stopPropagation()">
      <li
        *ngFor="let customerCtrl of jointCustomersFormArray.controls; let i = index"
        [class.active]="jointCustomerStepper?.selectedIndex === i"
        [class.completed]="customerCtrl.valid"
        (click)="jointCustomerStepper && (jointCustomerStepper.selectedIndex = i)">
        <span>
          {{ customerCtrl.get('customerData')?.value?.personalInfo?.lastName }}
          {{ customerCtrl.get('customerData')?.value?.personalInfo?.firstName }}
        </span>
      </li>
    </ul>
  </ng-template>

  <!-- BRANCHE 1 : CAS CONJOINT -->
  <ng-container *ngIf="isJointAccount; else nominalCustomerStepper">
    <app-stepper
      #jointCustomerStepper
      [nextFunction]="update"
      [doneFunction]="doneCustomerStep"
      [firstPreviousFunction]="previousStep"
      [showNavigationList]="false"
      doneButtonLabel="Suivant"
      [disableFirstStepPreviousButton]="true">

      <ng-container formArrayName="jointCustomersForms">
        <cdk-step
          *ngFor="let customerCtrl of jointCustomersFormArray.controls; let i = index"
          [formGroupName]="i"
          [stepControl]="customerCtrl"
          [completed]="customerCtrl.valid">

          <div formGroupName="employer">
            <ng-container *ngTemplateOutlet="employerFieldsTpl; context: {
              empGroup: customerCtrl.get('employer'),
              clientName: (customerCtrl.get('customerData')?.value?.personalInfo?.firstName + ' ' + customerCtrl.get('customerData')?.value?.personalInfo?.lastName)
            }"></ng-container>
          </div>

          <div formGroupName="financialData">
            <ng-container *ngTemplateOutlet="financialFieldsTpl; context: {
              finGroup: customerCtrl.get('financialData')
            }"></ng-container>
          </div>

        </cdk-step>
      </ng-container>

    </app-stepper>
  </ng-container>

  <!-- BRANCHE 2 : CAS NOMINAL (INCHANGÉ) -->
  <ng-template #nominalCustomerStepper>
    <!-- ... ton code nominal inchangé ... -->
  </ng-template>
</cdk-step>


.sub-clients-list {
  list-style: none;
  padding-left: 16px;
  margin-top: 8px;
  border-left: 1px solid #d9d9d9;

  li {
    padding: 4px 8px;
    font-size: 12px;
    color: #6c757d;
    cursor: pointer;
    transition: color 0.2s;

    &:hover {
      color: #e33550; // Couleur primaire SGMA
    }

    &.active {
      font-weight: 600;
      color: #e33550;
    }

    &.completed:not(.active) {
      color: #28a745;
    }
  }
}




import { trigger, transition, style, animate } from '@angular/animations';
import {
  CdkStepper,
  STEPPER_GLOBAL_OPTIONS,
} from '@angular/cdk/stepper';
import { ChangeDetectionStrategy, Component, ContentChild, Input, OnInit, TemplateRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { StepAction } from '../../models';

@Component({
  selector: 'app-stepper',
  templateUrl: './stepper.component.html',
  styleUrls: ['./stepper.component.scss'],
  providers: [
    { provide: CdkStepper, useExisting: StepperComponent },
    {
      provide: STEPPER_GLOBAL_OPTIONS,
      useValue: { displayDefaultIndicatorType: true },
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ transform: 'translateX(-5px)', opacity: 0 }),
        animate('200ms ease-in', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateX(-5px)', opacity: 0 }))
      ])
    ])
  ]
})
export class StepperComponent extends CdkStepper implements OnInit {

  @ContentChild('additionalActions') additionalActions!: TemplateRef<any>;

  @Input() doneFunction: () => void = () => { };
  @Input() nextFunction: () => void = () => { };
  @Input() previousFunction: () => void = () => { };
  @Input() firstPreviousFunction: () => void = () => { };

  @Input() doneButtonLabel: string = 'Valider';
  @Input() nextButtonLabel: string = 'Suivant';
  @Input() previousButtonLabel: string = 'Retour';

  @Input() showNavigationButtons: boolean = true;
  @Input() disabledDoneButton: boolean = false;
  @Input() disableNavigation: boolean = false;
  @Input() disableFirstStepPreviousButton: boolean = false;
  @Input() hideLastStepDoneButton: boolean = false;
  @Input() stepBodyWrapperClass: string = "";

  @Input() showIndicator: boolean = true;
  @Input() showNavigationList: boolean = true;

  @Input() showDoneButton: boolean = false;
  @Input() actions?: BehaviorSubject<StepAction>;
  @Input() showMessageInfo:boolean=false;
  @Input() messageInfoContent:string=""

  ngOnInit() {
    if (this.actions) {
      this.actions.subscribe(action => {
        switch (action) {
          case StepAction.NEXT: this.next(); break;
          case StepAction.PREVIOUS: this.previous(); break;
          default: console.log('Unhandled action of type ' + action);
        }
      });
    }
  }


  isLastStep() {
    return this.steps.length === this.selectedIndex + 1;
  }

  isFirstStep() {
    return this.selectedIndex === 0;
  }

  isStepperCompleted() {
    return this.steps.map((step) => step.completed).every((b) => b);
  }

  get indicator() {
    return (this.currentStep / this.stepsLength) * 100;
  }

  get stepsLength() {
    return this.steps.length;
  }

  get completedStepsLength() {
    return this.steps.filter((s) => s.completed).length;
  }

  get currentStep() {
    return this.selectedIndex + 1;
  }

  onDone() {
    this.doneFunction();
  }

  onPrevious() {
    this.previousFunction();
    if (!this.actions) {
      this.previous();
    }
  }

  onNext() {
    this.nextFunction();
    if (!this.actions) {
      this.next();
    }
  }

  onFirstPrevious() {
    this.firstPreviousFunction();
  }

  stateIcon(index: number): any {
    const step = this.steps.toArray()[index];
    const isCurrentStep = this._isSelectedStep(index);
    if (step.hasError && !isCurrentStep) {
      return 'warning';
    } else if (isCurrentStep) {
      return 'edit';
    } else if (step.completed && !isCurrentStep) {
      return 'done';
    } else {
      return '';
    }
  }

  private _isSelectedStep(index: number) {
    return this.selectedIndex === index;
  }

  get progressBarHeight() {
    return (this.completedStepsLength / this.stepsLength) * 100;
  }
}







<ul *ngIf="showNavigationList" class="third-step-level justify-content-between">
  <li class="stepper-label" *ngFor="let step of steps; let i=
                index" [ngClass]="{ active: selectedIndex === i }" (click)="selectedIndex= i">
    <span class="step-title">
      <span class="icon-title">
        <svg xmlns="http://www.w3.org/2000/svg" *ngIf="stateIcon(i) === 'done'" width="14" height="14"
          viewBox="0 0 14 14" [@slideInOut]>
          <g transform="translate(-184 -42)">
            <path class="colored-path" d="M7,0A7,7,0,1,1,0,7,7,7,0,0,1,7,0Z" transform="translate(184 42)" />
            <g transform="translate(186.837 45.87)">
              <path
                d="M-329.251,320.093l1.856-1.859q1.056-1.057,2.114-2.113a.831.831,0,0,1,1.114-.107.83.83,0,0,1,.141,1.194c-.039.047-.083.089-.126.133l-4.437,4.439a.845.845,0,0,1-1.333,0c-.662-.661-1.326-1.319-1.983-1.985a.827.827,0,0,1,.377-1.4.821.821,0,0,1,.817.248q.656.659,1.315,1.315C-329.354,320-329.309,320.039-329.251,320.093Z"
                transform="translate(332.161 -315.847)" fill="#fff" />
            </g>
          </g>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" *ngIf="stateIcon(i) === 'warning'" width="14" height="14"
          viewBox="0 0 14 14" [@slideInOut]>
          <g transform="translate(-87 -264)">
            <g transform="translate(-97 222)">
              <g transform="translate(184 42)" fill="#fff">
                <path
                  d="M 7 13.5 C 3.415889978408813 13.5 0.5 10.58411026000977 0.5 7 C 0.5 3.415889978408813 3.415889978408813 0.5 7 0.5 C 10.58411026000977 0.5 13.5 3.415889978408813 13.5 7 C 13.5 10.58411026000977 10.58411026000977 13.5 7 13.5 Z"
                  stroke="none" />
                <path class="colored-path"
                  d="M 7 1 C 3.691590309143066 1 1 3.691590309143066 1 7 C 1 10.30840969085693 3.691590309143066 13 7 13 C 10.30840969085693 13 13 10.30840969085693 13 7 C 13 3.691590309143066 10.30840969085693 1 7 1 M 7 0 C 10.86598968505859 0 14 3.134010314941406 14 7 C 14 10.86598968505859 10.86598968505859 14 7 14 C 3.134010314941406 14 0 10.86598968505859 0 7 C 0 3.134010314941406 3.134010314941406 0 7 0 Z"
                  stroke="none" fill="#d24554" />
              </g>
            </g>
            <path
              d="M1.481-3.634,1.3-7.438,1.269-8.71H2.563L2.518-7.438l-.178,3.8ZM1.916-1.1a.806.806,0,0,1-.591-.245.846.846,0,0,1-.245-.625A.846.846,0,0,1,1.324-2.6a.806.806,0,0,1,.591-.245.783.783,0,0,1,.591.245.868.868,0,0,1,.234.625.868.868,0,0,1-.234.625A.783.783,0,0,1,1.916-1.1Z"
              transform="translate(92.09 275.906)" fill="#e33550" />
          </g>
        </svg>
        <!-- Add svg if file is uploaded -->
        <!-- <svg xmlns="http://www.w3.org/2000/svg" width="11.077" height="7.983">
          <g data-name="Component 287 – 3">
            <path fill="none" stroke="#EE3B45" stroke-linecap="round" stroke-width="2" d="m1.414 3.474 3.094 3.095 5.155-5.155"/>
          </g>
        </svg>  -->
         <!-- -------------------------- --> 
      </span>
      <ng-container *ngIf="step.stepLabel; else showLabelText" [ngTemplateOutlet]="step.stepLabel.template">
      </ng-container>
       <!-- <span class="uploaded"> test test </span> -->
      <ng-template #showLabelText>
        <span [ngClass]="{ validated: stateIcon(i) === 'done' }">
          {{ step.label }}
        </span>
      </ng-template>
    </span>
  </li>
</ul>
<ng-template #stepBody>
  <div class="step-body">
    <div *ngIf="showIndicator" class="stepper-indicator">
      <div class="position-relative">
        <div class="stepper-indicator-text">
          <span>{{ currentStep }}/{{ stepsLength }}</span>
        </div>
        <mat-spinner mode="determinate" [value]="indicator" strokeWidth="2" diameter="90">
        </mat-spinner>
      </div>
    </div>
    <ng-container *ngIf="additionalActions" [ngTemplateOutlet]="additionalActions"></ng-container>
    <ng-container *ngIf="selected" [ngTemplateOutlet]="selected.content"></ng-container>
    <div class="stepper-content-navigation" *ngIf="showNavigationButtons">
      <button type="button" [disabled]="(isFirstStep() && disableFirstStepPreviousButton) || disableNavigation"
        (click)="isFirstStep()?onFirstPrevious():onPrevious()" class="default-btn">
        {{previousButtonLabel}}
      </button>

      <!-- Add button Extraire -->
      <div>
        <ng-content select="[rightAdditionalBtns]"></ng-content>
        <button type="button" *ngIf="!isLastStep();else doneButton" (click)="onNext()" [disabled]="disableNavigation"
          class="action-btn">
          {{ nextButtonLabel}}
        </button>
         <ng-container *ngIf="!isLastStep() && showDoneButton "      
         [ngTemplateOutlet]="doneButton"></ng-container>
      </div>
      <ng-template #doneButton>
        <button type="button" *ngIf="!hideLastStepDoneButton" (click)="onDone()"
          [disabled]="disabledDoneButton || disableNavigation" class="action-btn ml-3">
          {{ doneButtonLabel}}
        </button>
      </ng-template>
    </div>
    <div class="d-flex justify-content-end align-items-center"  *ngIf="showMessageInfo">
      <span class="span-info">
      {{messageInfoContent}}
     </span></div>
  </div>
</ng-template>
<div *ngIf="stepBodyWrapperClass;else stepBody" [class]="stepBodyWrapperClass">
  <div class="doc-step">
    <ng-container *ngIf="selected" [ngTemplateOutlet]="stepBody"></ng-container>
  </div>
</div>


















// Parent



       <div class="workflow-task-container " [ngClass]="{expanded:toggleShow}">
  <div class="data-capture-main">
    <div mode="side" opened class="stepper-list-container">
      <ul class="stepper-list">
        <li>
          <span class="step-title">INSTRUCTION</span>
          <ul class="second-step-level">
            <li>
              <button class="step-title active" type="button" (click)="instructionToggle = true">
                <span>Données</span>
              </button>
              <app-initiation-stepper *ngIf="instructionToggle" (validation)="showDocuments()" (goToloanHistoryStep)="OnGoToLoanHistoryStep($event)"></app-initiation-stepper>
            </li>
            <li>
              <button class="step-title" [ngClass]="{active:!instructionToggle}" type="button">
                <span> Documents </span>
              </button>
              <app-loan-attachments *ngIf="!instructionToggle"></app-loan-attachments>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
  <div class="data-view-main r-data-view-main">
    <app-vertical-tabs #verticalStepper  [(toggleShow)]="toggleShow">
      <app-vertical-tab-item [label]="'customer.info.data.tiers' | translate">
        <app-customer-personal-info>
        </app-customer-personal-info>
      </app-vertical-tab-item>
      <app-vertical-tab-item *ngIf="!(dossierData$ | async)?.customerData?.personalInfo?.prospect" [label]="'customer.info.mvt.bank' | translate">
        <app-customer-balance-activity-wrapper>
        </app-customer-balance-activity-wrapper>
      </app-vertical-tab-item>
     <app-vertical-tab-item [label]="'customer.info.loan.history' | translate">
       <app-loan-history></app-loan-history>
      </app-vertical-tab-item>
    </app-vertical-tabs>
  </div>
</div>



       import { CdkStepper } from '@angular/cdk/stepper';
import { Injector, Component, ViewChild } from '@angular/core';
import { DossierData } from '@core/models';
import { DossierDataStoreService } from '@core/services';
import { BaseComponent } from '@shared/components';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-init-view',
  templateUrl: './init-view.component.html',
  styleUrls: ['./init-view.component.scss'],
  providers: [DossierDataStoreService],
})
export class InitViewComponent extends BaseComponent {
  dossierData$!: Observable<DossierData>;
  toggleShow = false;
  instructionToggle = true;
  router: any;
  @ViewChild('verticalStepper') verticalStepper!: CdkStepper;


  constructor(injector: Injector, private dossierStore: DossierDataStoreService
  ) {
    super(injector);
    this.dossierData$ = this.dossierStore.dossierData$;
    this.initState();
  }

  private initState() {
    const initialState = this.router.getCurrentNavigation()?.extras.state;
    if (!initialState) {
      this.router.navigateByUrl('/');
    }
    this.dossierStore.init({...initialState, mode: 'CREATE'});
  }

  showDocuments() {
    this.instructionToggle = false;
  }

  OnGoToLoanHistoryStep(event: any): void {
    this.goToStep(2);
    this.toggleShow=false;
  }


  goToStep(index:number){
    if(index>=0 && index<this.verticalStepper?.steps?.length){
      this.verticalStepper.selectedIndex=index;
    }
  }
}

