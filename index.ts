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
