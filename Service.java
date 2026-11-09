
// Paths vidables (whitelist). Zid hna les champs saisis par l'user.
private static final Set<String> CLEARABLE_PATHS = Set.of(
        "loanData.delayed",
        "loanData.delayDuration",
        "loanData.delayType",
        "loanData.requestedNotaryFee",
        "loanData.claimedAmountOfPurchase",
        "loanData.claimedAmountOfBuildDevelopment"
        // ... les autres champs saisissables
);

@Auditable(actionType = AuditActionType.VALIDATE_DOSSIER_REQUEST, objectClass = AuditableObject.DOSSIER_REQUEST)
public DossierDataDto validateDossierRequest(String uuid) {
    try {
        DossierRequestDto request = dossierDataClient.getDossierRequestByUuid(uuid);
        Assert.notNull(request, messageService.getMessage(MessageKeyConstants.DOSSIER_REQUEST_INPROGRESS_NOTFOUND));

        // Garde de statut: idempotent si déjà validé
        if (RequestStatus.ACCEPTED.toString().equals(request.getRequestStatus())) {
            return dossierDataDtoMapper.convertToApiDTO(
                    dossierDataClient.retrieveByUuid(request.getDossier().getUuid()));
        }

        DossierDataDto patch = dossierRequestMapper.toDossierDataDto(request);
        patch.setClearedFields(request.getClearedFields());

        DossierDataDto result = patchDossier(patch);

        // ACCEPTED seulement après succès du patch
        request.setRequestStatus(RequestStatus.ACCEPTED.toString());
        updateDossierRequest(request);
        return result;
    } catch (BusinessException ex) {          // adapte au nom de ton exception métier
        throw ex;
    } catch (RuntimeException ex) {
        log.error("Error in validateDossierRequest, uuid={}", uuid, ex);
        throw new TechnicalException("You cannot perform this action", ex);
    }
}

@Auditable(actionType = AuditActionType.MODIFICATION, objectClass = AuditableObject.DOSSIER_DATA)
public DossierDataDto patchDossier(DossierDataDto patch) {
    AuditContextHolder.setObjectId(patch.getUuid());

    DossierDataDto current = dossierDataDtoMapper.convertToApiDTO(
            dossierDataClient.retrieveByUuid(patch.getUuid()));

    applyPatch(current, patch);   // 1. présent / vidé
    deriveFields(current);        // 2. calculables sur l'état final

    return updateDossier(current, current.getCodeStatus());
}

private void applyPatch(DossierDataDto target, DossierDataDto patch) {
    // a) Valeurs non-null (comme avant)
    List<String> nonNull = ObjectUtils.getNonNullPropertyNames(patch);
    nonNull.removeIf(p -> p.endsWith("Valid") || p.endsWith("empty") || p.startsWith("clearedFields"));
    ObjectUtils.copySelectedProperties(patch, target, nonNull);

    // b) Champs vidés explicitement
    Set<String> cleared = patch.getClearedFields();
    if (cleared == null || cleared.isEmpty()) {
        return;
    }
    BeanWrapper wrapper = PropertyAccessorFactory.forBeanPropertyAccess(target);
    wrapper.setAutoGrowNestedPaths(true);   // évite NPE si loanData est null

    for (String path : cleared) {
        if (!CLEARABLE_PATHS.contains(path)) {
            log.warn("clearedFields: path ignoré (hors whitelist): {}", path);
            continue;
        }
        if (!wrapper.isWritableProperty(path)) {
            continue;
        }
        Class<?> type = wrapper.getPropertyType(path);
        if (type != null && type.isPrimitive()) {
            log.warn("clearedFields: path primitif ignoré: {}", path);
            continue;
        }
        wrapper.setPropertyValue(path, null);
    }
}

// Idempotent: toujours exécuté sur l'état final, sans conditions "contains(path)"
private void deriveFields(DossierDataDto dossier) {
    recalculateLoanAmounts(dossier);
    recalculateRates(dossier);

    boolean delayed = dossier.getLoanData() != null
            && Boolean.TRUE.equals(dossier.getLoanData().getDelayed());
    if (!delayed && DossierStatus.statusesToPurgeDelayedFields().contains(dossier.getCodeStatus())) {
        dossierDataHelper.purgeDossierDelayedFields(dossier);
    }
}











@Auditable(actionType = AuditActionType.VALIDATE_DOSSIER_REQUEST, objectClass = AuditableObject.DOSSIER_REQUEST)
	public DossierDataDto validateDossierRequest(String uuid) {
		try {
			DossierRequestDto dossierRequestDto = dossierDataClient.getDossierRequestByUuid(uuid);
			Assert.notNull(dossierRequestDto, messageService.getMessage(MessageKeyConstants.DOSSIER_REQUEST_INPROGRESS_NOTFOUND));

			DossierDataDto dossier= dossierRequestMapper.toDossierDataDto(dossierRequestDto);
			DossierDataDto dossierDataDto = patchDossier(dossier);

			dossierRequestDto.setRequestStatus(RequestStatus.ACCEPTED.toString());
			updateDossierRequest(dossierRequestDto);
			return dossierDataDto;
		}
		catch(RuntimeException ex){
			log.error("Error in validateDossierRequest ",ex);
			throw new TechnicalException("You cannot perform this action");
		}
	}

@Auditable(actionType = AuditActionType.MODIFICATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto patchDossier(DossierDataDto dossierDataDto) {
		AuditContextHolder.setObjectId(dossierDataDto.getUuid());

		DossierDataCoreDto oldDossier = dossierDataClient.retrieveByUuid(dossierDataDto.getUuid());
		DossierDataDto dossierData = dossierDataDtoMapper.convertToApiDTO(oldDossier);

		List<String> nonNullProperties = ObjectUtils.getNonNullPropertyNames(dossierDataDto);
		nonNullProperties.removeIf(item -> item.endsWith("Valid") || item.endsWith("empty"));

		ObjectUtils.copySelectedProperties(dossierDataDto, dossierData, nonNullProperties);

		String purchasePath = DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.claimedAmountOfPurchase;
		String buildPath = DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.claimedAmountOfBuildDevelopment;

		if (nonNullProperties.contains(purchasePath) || nonNullProperties.contains(buildPath)) {
			recalculateLoanAmounts(dossierData);
		}

		String rateTypePath = DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR + LoanDataDto.Fields.rateType + ObjectUtils.PROPERTY_NAME_SEPARATOR + CodeLabelDto.Fields.code;

		if (nonNullProperties.contains(rateTypePath)) {
			recalculateRates(dossierData);
		}

		boolean isDelayedNull = (dossierDataDto.getLoanData() == null || dossierDataDto.getLoanData().getDelayed() == null);
		if (isDelayedNull && DossierStatus.statusesToPurgeDelayedFields().contains(dossierData.getCodeStatus()) ){
			dossierDataHelper.purgeDossierDelayedFields(dossierData);
		}

		return updateDossier(dossierData, dossierData.getCodeStatus());
	}

private DossierDataDto updateDossier(DossierDataDto dossierDataDto, String codeStatus) {
		controlDossier(dossierDataDto, !DossierStatus.INITIATION.getCode().equals(codeStatus));
		DossierDataCoreDto dossierDataCoreDto = dossierDataDtoMapper.convertToCoreDTO(dossierDataDto);
		dossierDataHelper.purgeNonUpdatableDossierFields(dossierDataCoreDto);

		// Calculate monthly installment value and set it into 'dossier'
		getMonthlyInstallment(dossierDataCoreDto);
		generateDefaultWarranties(dossierDataCoreDto);

		DossierDataCoreDto updatedDossier = dossierDataClient.update(dossierDataCoreDto.getUuid(), dossierDataCoreDto);
		createDossierAttachmentTypes(updatedDossier,dossierDataDto.getProspectUuid());
		DossierDataCoreDto latesDossier  = dossierDataClient.retrieveByUuid(dossierDataCoreDto.getUuid());

		return dossierDataDtoMapper.convertToApiDTO(latesDossier);
	}




    @Mapping(source = "claimedAmountOfPurchase", target = "loanData.claimedAmountOfPurchase")
    @Mapping(source = "claimedAmountOfBuildDevelopment", target = "loanData.claimedAmountOfBuildDevelopment")
    @Mapping(source = "typeRate", target = "loanData.rateType", qualifiedByName = "codeRefRateTypeToCodeLabelDto")
    @Mapping(source = "creditRate", target = "loanData.rate")
    @Mapping(source = "cappedRate", target = "loanData.cappedRate")
    @Mapping(source = "deadlineNumber", target = "loanData.deadlineNumber")
    @Mapping(source = "applicationFee", target = "loanData.applicationFee")
    @Mapping(source = "freeHandFee", target = "loanData.freeHandFee")
    @Mapping(source = "acquisitionFee", target = "loanData.acquisitionFee")
    @Mapping(source = "insuranceCoefficient", target = "insuranceData.insuranceCoefficient")
    @Mapping(source = "insuredPercentage", target = "insuranceData.insuredPercentage")
    @Mapping(source = "promotionalInsuranceRate", target = "insuranceData.promotionalInsuranceRate")
    @Mapping( source = "delayType", target = "loanData.delayType", qualifiedByName = "codeRefRateTypeToCodeLabelDto")
    @Mapping(source = "delayed" ,target = "loanData.delayed" )
    @Mapping( source = "delayDuration" ,target = "loanData.delayDuration")
    @Mapping( source = "requestWarranties" ,target = "warranties")
    @Mapping( source = "requestRestrictions" ,target = "restrictions")

    @Mapping(source = "requestedNotaryFee", target = "loanData.requestedNotaryFee")
    @Mapping(source = "subsidizedCreditAmount", target = "loanData.subsidizedCreditAmount")
    @Mapping(source = "bonusCreditAmount", target = "loanData.bonusCreditAmount")
    @Mapping(source = "suportedCreditAmount", target = "loanData.suportedCreditAmount")
    @Mapping(source = "subsidizedCreditDuration", target = "loanData.subsidizedCreditDuration")
    @Mapping(source = "bonusCreditDuration", target = "loanData.bonusCreditDuration")
    @Mapping(source = "suportedCreditDuration", target = "loanData.suportedCreditDuration")
    @Mapping(source = "subsidizedCreditRate", target = "loanData.subsidizedCreditRate")
    @Mapping(source = "bonusCreditRate", target = "loanData.bonusCreditRate")
    @Mapping(source = "suportedCreditRate", target = "loanData.suportedCreditRate")
    @Mapping(source = "subsidizedInsuredPercentage", target = "insuranceData.subsidizedInsuredPercentage")
    @Mapping(source = "subsidizedPromotionalInsuranceRate", target = "insuranceData.subsidizedPromotionalInsuranceRate")
    @Mapping(source = "subsidizedInsuranceCoefficient", target = "insuranceData.subsidizedInsuranceCoefficient")
    @Mapping(source = "bonusInsuredPercentage", target = "insuranceData.bonusInsuredPercentage")
    @Mapping(source = "bonusPromotionalInsuranceRate", target = "insuranceData.bonusPromotionalInsuranceRate")
    @Mapping(source = "bonusInsuranceCoefficient", target = "insuranceData.bonusInsuranceCoefficient")
    @Mapping(source = "suportedInsuredPercentage", target = "insuranceData.suportedInsuredPercentage")
    @Mapping(source = "suportedPromotionalInsuranceRate", target = "insuranceData.suportedPromotionalInsuranceRate")
    @Mapping(source = "suportedInsuranceCoefficient", target = "insuranceData.suportedInsuranceCoefficient")

    @Mapping(source = "typeAloanAmount", target = "loanData.typeAloanAmount")
    @Mapping(source = "typeBloanAmount", target = "loanData.typeBloanAmount")
    @Mapping(source = "additionalCredit", target = "loanData.additionalCredit")
    @Mapping(source = "typeAloanRate", target = "loanData.typeAloanRate")
    @Mapping(source = "typeBloanRate", target = "loanData.typeBloanRate")
    @Mapping(source = "additionalCreditRate", target = "loanData.additionalCreditRate")
    @Mapping(source = "typeAloanDuration", target = "loanData.typeAloanDuration")
    @Mapping(source = "typeBloanDuration", target = "loanData.typeBloanDuration")
    @Mapping(source = "additionalLoanDuration", target = "loanData.additionalLoanDuration")
    @Mapping(source = "typeAInsuredPercentage", target = "insuranceData.typeAInsuredPercentage")
    @Mapping(source = "typeAPromotionalInsuranceRate", target = "insuranceData.typeAPromotionalInsuranceRate")
    @Mapping(source = "typeAInsuranceCoefficient", target = "insuranceData.typeAInsuranceCoefficient")
    @Mapping(source = "typeBInsuredPercentage", target = "insuranceData.typeBInsuredPercentage")
    @Mapping(source = "typeBPromotionalInsuranceRate", target = "insuranceData.typeBPromotionalInsuranceRate")
    @Mapping(source = "typeBInsuranceCoefficient", target = "insuranceData.typeBInsuranceCoefficient")

    @Mapping(source = "aditionalCreditInsuredPercentage", target = "insuranceData.aditionalCreditInsuredPercentage")
    @Mapping(source = "aditionalCreditPromotionalInsuranceRate", target = "insuranceData.aditionalCreditPromotionalInsuranceRate")
    @Mapping(source = "aditionalCreditInsuranceCoefficient", target = "insuranceData.aditionalCreditInsuranceCoefficient")
    @Mapping(source = "dossier.uuid", target = "uuid")
    @Mapping(target = "beneficiaries", qualifiedByName = "mapBenefWithoutId")
    @Mapping(target = "guarantors", qualifiedByName = "toGuarantorWithoutId")
    @Mapping(target = "representatives", qualifiedByName = "toRepresentativeWithoutId")
    @Mapping(target = "propertyData.properties", qualifiedByName = "mapProperty")
    public abstract DossierDataDto toDossierDataDto(DossierRequestDto dossierRequestDto);
