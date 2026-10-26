//// HTML

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



       /// TS

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

// CSS

@import '../../ng-styles/variables';

:host {
  display: flex;
  width: 100%;
  justify-content: center;
  flex-grow: 1;
  flex-basis: 0;
}

.stepper-list-container {
  width: 140px;
  box-shadow: 0px 0px 17px 0 rgb(0 0 0 / 13%);
  background: #fff;
  padding: 26px 10px 0 14px;

  .stepper-list {
    display: flex;
    flex-direction: column;
  }
}

.third-step-level {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-left: 0;
 //height: calc(100vh - 240px);
  .stepper-label{
    position: relative;
    // min-height: 32px;
    max-width: 106px;
    .step-title {
      display: flex;
      font-size: 10px;
      color: #796c8a;
      line-height: 14px;
      font-family: $SecondaryFontRegular;
      // display: inline-flex;
      gap: 8px;
      align-items: center;
      border: none;
      background: transparent;
      cursor: pointer;
      transition: all 0.2s ease;
      .icon-title {
        // min-width: 15px;
        .colored-path {
          fill: $MainColor;
        }
        &+span {
          flex-grow: 1;
          flex-basis: 0;
        }
      }

      &:hover {
        // font-family: $SecondaryFontSemiBold;
        // padding-left: 4px;
        color: #010235;
      }
      .uploaded {
        font-family: $SecondaryFontSemiBold;
        color: $MainColor;
      }
    }
    // &:before{
    //   content:"";
    //   position: absolute;
    //   left: -13px;
    //   top: 50%;
    //   width: 2px;
    //   height: 0;
    //   background: $MainColor;
    //   box-shadow: 0 0 4px $MainColor;
    //   transform: translateY(-50%);
    //   transition: all 0.2s ease;
    // }
    &:hover {
      &:before{
        height: 100%;
      }
    }
    &.active {
    span{
      font-family: $SecondaryFontSemiBold;
      color: #010235;}
    &:before{
      height: 100%;
    }
  }
  }
  span.validated{color: $MainColor;}
}

.step-body {
  flex-grow: 1;
  flex-basis: 0;
  display: flex;
  flex-direction: column;
  position: absolute;
  top: 0;
  right: 0;
  height: 100vh;
  width: calc(100% - 140px);
  overflow: hidden;

  .step-body {
    width: 80%;
    position: static;
    flex-grow: 0;
    flex-basis: auto;
    overflow: visible;
    overflow-y: hidden;
    padding-left: 30px;
    padding-right: 30px;
    .step-body {
      width: 100%;
    }
  }
}

.stepper-indicator {
  position: absolute;
  right: 20px;
  top: 20px;
  z-index: 9;
  width: 90px;
  height: 90px;

  .stepper-indicator-text {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 62px;
    height: 62px;
    background: #fff;
    border-radius: 100%;
    box-shadow: 0px 0px 16px #A9ACBD33;
    transform: translate(-50%, -50%);

    >span {
      font-family: $SecondaryFontBold;
      font-size: 16px;
    }
  }
}

.stepper-content-navigation {
  display: flex;
  justify-content: space-between;
  padding: 26px 10px;
}

.additional-action {
  position: absolute;
  z-index: 9;
  left: 0;
  margin: 20px;
}

.stepper-indicator-text {
  position: absolute;
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
}

.stepper-progress-bar {
  width: 2px;
  border-left: 2px solid red;
  right: 0;
  position: absolute;
}

::ng-deep .mat-drawer-container {
  position: inherit;
}

.doc-step {
  display: flex;
  width: 100%;
  justify-content: center;
  flex-grow: 1;
  flex-basis: 0;
}

.span-info{
  font-size: 13px;
    width: 45%;
}
