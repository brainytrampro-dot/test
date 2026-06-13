isFormValuesChanged(): boolean {
    const { loanData, insuranceData, propertyData, beneficiaries, guarantors, representatives, notary, warranties } = this.data;
    const formValue = this.formGroup.value;

    // 1. Structure miroir du formulaire
    const newFormObject: any = {
      loanData: formValue.loanData,
      propertyData: formValue.propertyData,
      beneficiaries: formValue.beneficiaries || [],
      guarantors: formValue.guarantors || [],
      representatives: formValue.representatives || [],
      notary: formValue.notary || {},
      warranties: this.warranties || [],
      insuranceData: {
        ...formValue.insuranceData,
        insuranceCoefficient: NumberUtils.toForcedNumber((this.isYassir || this.isPpoPpc) ? 0.8 : formValue.insuranceData?.insuranceCoefficient),
        subsidizedInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.subsidizedInsuranceCoefficient),
        bonusInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.bonusInsuranceCoefficient),
        suportedInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.suportedInsuranceCoefficient),
        typeAInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.typeAInsuranceCoefficient),
        typeBInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.typeBInsuranceCoefficient),
        aditionalCreditInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.aditionalCreditInsuranceCoefficient),
      },
    };

    const initialObject = { loanData, insuranceData, propertyData, beneficiaries, guarantors, representatives, notary: notary || {}, warranties };

    // 2. Correction majeure de l'alignement des listes imbriquées
    const extractFormSkeletton = (initial: any, form: any): any => {
      if (form === undefined) return undefined;
      
      // Si la donnée d'origine n'a pas cet objet (ex: nouvel ajout), on crée un miroir vide pour forcer le diff
      if (initial === null || initial === undefined) {
        if (Array.isArray(form)) return [];
        if (typeof form === 'object') return {};
        return null;
      }

      if (typeof initial !== 'object' || initial instanceof Date) {
        return initial;
      }

      // Traitement dynamique des Tableaux Imbriqués (Prend la taille maximale)
      if (Array.isArray(initial)) {
        const formArray = Array.isArray(form) ? form : [];
        const maxLength = Math.max(initial.length, formArray.length);
        const alignedArray: any[] = [];
        
        for (let i = 0; i < maxLength; i++) {
          alignedArray.push(extractFormSkeletton(initial[i], formArray[i]));
        }
        return alignedArray;
      }

      // Traitement des objets imbriqués
      const result: any = {};
      Object.keys(form).forEach(key => {
        if (key in initial) {
          result[key] = extractFormSkeletton(initial[key], form[key]);
        } else {
          result[key] = form[key] === '' ? null : form[key];
        }
      });
      return result;
    };

    // 3. Génération du squelette parfait
    const filteredInitialObject = extractFormSkeletton(initialObject, newFormObject);
    
    // 4. Calcul des différences réelles
    const modifications = ObjectUtils.diffObjects(filteredInitialObject, newFormObject);
    
    console.log("Deltas trouvés dans les sous-tableaux :", modifications);
    return Object.keys(modifications).length > 0;
}
