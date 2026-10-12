   private WarrantyDto warranty(String template, String code, Object... args) {
        return WarrantyDto.builder().code(code).content(String.format(template, args)).type(WarrantyType.AUTO).build();
    }
	public void generateDefaultWarranties(DossierDataCoreDto dossier) {
		boolean excludedProducts = List.of(
				ProductCode.PPI_VEFA_RESIDENT.toString().toLowerCase(),
				ProductCode.PPI_ENGAGEMENT_PROMOTEUR.toString().toLowerCase(),
				ProductCode.MOULKIA.toString().toLowerCase(),
				ProductCode.PPC.toString().toLowerCase(),
				ProductCode.PPO.toString().toLowerCase(),
				ProductCode.PPO_PPR.toString().toLowerCase(),
				ProductCode.YASSIR.toString().toLowerCase(),
				ProductCode.YASSIR_PPR.toString().toLowerCase()).contains(dossier.getCodeProduct().toLowerCase());

		if (dossier == null || excludedProducts) return;
		boolean isCreatedBeforeTargetDate = dossier.getCreatedAt() != null && dossier.getCreatedAt().isBefore(LocalDateTime.of(2026, 6 , 15, 0, 0));
		if(isCreatedBeforeTargetDate){return;}
		if(!CollectionUtils.isEmpty(dossier.getWarranties())) dossier.getWarranties().removeIf(w-> WarrantyType.AUTO.equals(w.getType()));
		List<WarrantyDto> defaultWarranties = new ArrayList<>();

		List<BeneficiaryCoreDto> beneficiaries = Optional.ofNullable(dossier.getBeneficiaries()).orElse(Collections.emptyList());
		List<GuarantorCoreDto> guarantors = Optional.ofNullable(dossier.getGuarantors()).orElse(Collections.emptyList());
		LoanDataCoreDto loanData = dossier.getLoanData();
		String productCode = dossier.getCodeProduct();

		boolean hasEmprunteur = beneficiaries.stream().anyMatch(b -> Boolean.TRUE.equals(b.getIsBorrower()));
		boolean hasCaution = !guarantors.isEmpty();

		if (loanData != null) {
			defaultWarranties.add(warranty(WARRANTY_DECES_INVAL, CODE_DECES_INVAL, MoneyToWords.formatAmount(loanData.getLoanAmount())));
		}

		if (hasCaution && loanData != null) {
			guarantors.forEach(g -> defaultWarranties.add(warranty(WARRANTY_CAUTION_SOLIDAIRE,
					CODE_CAUTION_SOLIDAIRE, (g.getFirstName() + " " + g.getLastName()), MoneyToWords.formatAmount(loanData.getLoanAmount()))));
		}

		if (loanData != null && !("AQS".equals(loanData.getCodeLoanObject()) && "TRN".equals(loanData.getCodePropertyType()))) {
			defaultWarranties.add(warranty(WARRANTY_CONFORT_HAB,CODE_CONFORT_HAB, MoneyToWords.formatAmount(loanData.getLoanAmount())));
		}

		addWarrantiesForSpecificProducts(defaultWarranties, productCode);
		addPropertyWarranties(dossier, defaultWarranties);
		addMarketWarranties(dossier, defaultWarranties, hasEmprunteur);

		if (dossier.getWarranties() == null) dossier.setWarranties(new ArrayList<>());
		dossier.getWarranties().addAll(defaultWarranties);
	}

	private void addMarketWarranties(DossierDataCoreDto dossier, List<WarrantyDto> defaultWarranties, boolean hasEmprunteur) {
		if (!hasEmprunteur || dossier.getCustomerData() == null || dossier.getCustomerData().getCard() == null) return;
		String market = Optional.ofNullable(dossier.getCustomerData().getCard().getMarket()).orElse("");
		String country = dossier.getCustomerData().getCard().getResidenceCountry();
		if ((market.contains(MCH_01) || market.contains(MCH_09_PRI)) && "MAROC".equals(country.toUpperCase())) {
			defaultWarranties.add(warranty(WARRANTY_DOM_SALAIRE, CODE_DOM_SALAIRE));
		} else if (market.contains(MCH_02) || market.contains(MCH_03) || market.contains(MCH_09_PRO)) {
			defaultWarranties.add(warranty(WARRANTY_DOM_REVENUS, CODE_DOM_REVENUS));
		}
	}

	private void addPropertyWarranties(DossierDataCoreDto dossier, List<WarrantyDto> list) {
		if (dossier.getCodeProduct() == null || dossier.getPropertyData() == null) return;
		Optional.ofNullable(dossier.getBeneficiaries()).orElse(Collections.emptyList()).forEach(ben -> {
			boolean isEmprunteur = Boolean.TRUE.equals(ben.getIsBorrower());

			Map<Object, PropertyCoreDto> propertyMap = new HashMap<>();
			Optional.ofNullable(dossier.getPropertyData().getProperties()).orElse(List.of()).stream()
				.filter(Objects::nonNull)
				.forEach(p -> {
					if (p.getId() != null) {propertyMap.put(p.getId().toString(), p);}
					if (p.getUuid() != null) {propertyMap.put(p.getUuid(), p);}
				});

			Optional.ofNullable(ben.getRangs())
					.orElse(Collections.emptyList())
					.forEach(r -> {
						String key = r.getPropertyId() != null ? String.valueOf(r.getPropertyId()) : r.getPropertyUuid();
						PropertyCoreDto p = propertyMap.get(key);
						if (p != null) {
							if (isEmprunteur) {
								list.add(warranty(WARRANTY_HYPOTHEQUE, CODE_HYPOTHEQUE, r.getRang(), p.getLandCertificateNumber(), MoneyToWords.formatAmount(r.getWarrantyAmount())));
							}
							else {
								list.add(warranty(WARRANTY_CAUTION_HYPO, CODE_CAUTION_HYPO, r.getRang(), p.getLandCertificateNumber(), MoneyToWords.formatAmount(r.getWarrantyAmount())));
							}
						}
					});
		});
	}
	private void addWarrantiesForSpecificProducts(List<WarrantyDto> list, String productCode) {
		if (productCode == null) return;
		if (conventionProducts.contains(productCode)) {
			list.add(warranty(WARRANTY_ACCORD_FOND, CODE_ACCORD_FOND));
		}
		if (List.of(ProductCode.FOGALOGE.toString().toLowerCase(), ProductCode.FOGARIM.toString().toLowerCase()).contains(productCode.toLowerCase())) {
			list.add(warranty(WARRANTY_ACCEPT_CCG, CODE_ACCEPT_CCG));
		}
	}
