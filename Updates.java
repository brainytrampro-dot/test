@PostMapping(value = "/internal/{customerNumber}")
	public ResponseEntity<DebtGeneralDto> getInternalLoans(@PathVariable String customerNumber,@RequestBody DebtGeneralDto request) throws InvocationTargetException, IllegalAccessException {
		DebtGeneralDto cebdtGeneralDto = internalLoan.getLoansIntern(customerNumber);
		if(request.getDossierUuid() != null) {
			DossierDataDto dossierCore = DossierDataDto.builder()
					.uuid(request.getDossierUuid())
					.customerData(null)
					.debts(cebdtGeneralDto.getDebtDto())
					.build();
			dossierDataService.patchDossier(dossierCore);
		}
		return ResponseEntity.ok(cebdtGeneralDto);
	}

 public DebtGeneralDto getLoansIntern(String customerNumber) {
        if (StringUtils.isEmpty(customerNumber)) {
            throw new TechnicalException("No branch code found. Not able to retrieve customer branch code.");
        }
        DebtGeneralDto debtGeneralDto = new DebtGeneralDto();
        List<DebtDto> debts = new ArrayList<>();
        EntityModelGetLoanListResponseDTO loans = loanApiService.getLoansIntern(customerNumber);
        log.info("Response loans content: {}", loans.getContent());
        if (loans != null && loans.getContent() != null && !loans.getContent().isEmpty()) {
            EntityModelGetLoanListResponseDTO filteredLoans = getFilteredLoans(loans);
            log.info("Returned filteredLoans: {}", filteredLoans);

            Map<String, List<AmortizableLoanDTO>> loansMap = groupLoansByDuplicateFileNumber(filteredLoans);
            log.info("Returned loansMap: {}", loansMap);

            debts = getAndMapInternalLoans(loansMap);
            log.info("Returned Debts: {}", debts);
        }

        debtGeneralDto.setDebtDto(debts);
        return debtGeneralDto;
    }

@Override
	@Auditable(actionType = AuditActionType.MODIFICATION, objectClass = AuditableObject.DOSSIER_DATA)
	public DossierDataDto patchDossier(DossierDataDto dossierDataDto) {
		AuditContextHolder.setObjectId(dossierDataDto.getUuid());

		DossierDataCoreDto oldDossier = dossierDataClient.retrieveByUuid(dossierDataDto.getUuid());
		DossierDataDto dossierData = dossierDataDtoMapper.convertToApiDTO(oldDossier);

		List<String> nonNullProperties = ObjectUtils.getNonNullPropertyNames(dossierDataDto);
		nonNullProperties.removeIf(item -> item.endsWith("Valid") || item.endsWith("empty"));

		ObjectUtils.copySelectedProperties(dossierDataDto, dossierData, nonNullProperties);

		if (nonNullProperties
				.contains(DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
						+ LoanDataDto.Fields.claimedAmountOfPurchase)
				|| nonNullProperties.contains(DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
				+ LoanDataDto.Fields.claimedAmountOfBuildDevelopment)) {
			recalculateLoanAmounts(dossierData);
		}
		if (nonNullProperties.contains(DossierDataDto.Fields.loanData + ObjectUtils.PROPERTY_NAME_SEPARATOR
				+ LoanDataDto.Fields.rateType + ObjectUtils.PROPERTY_NAME_SEPARATOR + CodeLabelDto.Fields.code)) {
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
		warrantyService.generateDefaultWarranties(dossierDataCoreDto);
		DossierDataCoreDto updatedDossier = dossierDataClient.update(dossierDataCoreDto.getUuid(), dossierDataCoreDto);
		createDossierAttachmentTypes(updatedDossier,dossierDataDto.getProspectUuid());
		DossierDataCoreDto latesDossier  = dossierDataClient.retrieveByUuid(dossierDataCoreDto.getUuid());

		return dossierDataDtoMapper.convertToApiDTO(latesDossier);
	}
