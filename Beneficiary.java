isFormValuesChanged(): boolean {
  const { loanData, insuranceData, propertyData, beneficiaries, 
          guarantors, representatives, notary, warranties } = this.data;
  const formValue = this.formGroup.value;

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
      insuranceCoefficient: NumberUtils.toForcedNumber(
        (this.isYassir || this.isPpoPpc) ? 0.8 : formValue.insuranceData?.insuranceCoefficient
      ),
      subsidizedInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.subsidizedInsuranceCoefficient),
      bonusInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.bonusInsuranceCoefficient),
      suportedInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.suportedInsuranceCoefficient),
      typeAInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.typeAInsuranceCoefficient),
      typeBInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.typeBInsuranceCoefficient),
      aditionalCreditInsuranceCoefficient: NumberUtils.toForcedNumber(formValue.insuranceData?.aditionalCreditInsuranceCoefficient),
    },
  };

  const initialObject = { 
    loanData, insuranceData, propertyData, beneficiaries, 
    guarantors, representatives, notary: notary || {}, warranties 
  };

  // ✅ diffObjects gère maintenant nativement les nested arrays
  const modifications = ObjectUtils.diffObjects(initialObject, newFormObject);
  console.log("Deltas:", modifications);
  return Object.keys(modifications).length > 0;
}


static diffObjects(base: any, current: any): any {
  const changes: any = {};
  const excludedKeys = new Set(['id', 'uuid']);

  function normalize(v: any): any {
    if (v === '' || v === undefined) return null;
    return v;
  }

  function compare(a: any, b: any, path: string = '') {
    a = normalize(a);
    b = normalize(b);

    if (a === b) return;

    const lastKey = (path.split('.').pop() || '').replace(/\[\d+\]/g, '');
    if (excludedKeys.has(lastKey)) return;

    if (a == null || b == null) {
      changes[path] = { from: a, to: b };
      return;
    }

    if (a instanceof Date || b instanceof Date) {
      const ta = a instanceof Date ? a.getTime() : new Date(a).getTime();
      const tb = b instanceof Date ? b.getTime() : new Date(b).getTime();
      if (ta !== tb) changes[path] = { from: a, to: b };
      return;
    }

    if (Array.isArray(a) || Array.isArray(b)) {
      // ✅ L'un ou l'autre est array : on aligne sur maxLength
      const arrA = Array.isArray(a) ? a : [];
      const arrB = Array.isArray(b) ? b : [];
      const maxLength = Math.max(arrA.length, arrB.length);
      for (let i = 0; i < maxLength; i++) {
        compare(arrA[i], arrB[i], `${path}[${i}]`);
      }
      return;
    }

    if (typeof a === 'object' && typeof b === 'object') {
      // ✅ Union des clés des deux objets pour détecter ajouts/suppressions
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      keys.forEach(key => {
        if (excludedKeys.has(key)) return;
        compare(a[key], b[key], path ? `${path}.${key}` : key);
      });
      return;
    }

    changes[path] = { from: a, to: b };
  }

  compare(base, current);
  return changes;
}
