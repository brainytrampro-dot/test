@Service
public class WarrantyService {

    private static final LocalDateTime AUTO_START = LocalDateTime.of(2026, 6, 15, 0, 0);
    private static final Set<String> EXCLUDED = lower(PPI_VEFA_RESIDENT, PPI_ENGAGEMENT_PROMOTEUR,
            MOULKIA, PPC, PPO, PPO_PPR, YASSIR, YASSIR_PPR);
    private static final Set<String> CCG = lower(FOGALOGE, FOGARIM);

    private record Def(String code, String template,
                       Predicate<DossierDataCoreDto> when,
                       Function<DossierDataCoreDto, List<Object[]>> args) {}

    // الترتيب هنا = الترتيب ف الـ output
    private final List<Def> defs = List.of(
        new Def(CODE_DECES_INVAL, WARRANTY_DECES_INVAL,
            d -> d.getLoanData() != null,
            d -> args(amount(d))),

        new Def(CODE_CAUTION_SOLIDAIRE, WARRANTY_CAUTION_SOLIDAIRE,
            d -> d.getLoanData() != null,
            d -> orEmpty(d.getGuarantors()).stream()
                    .map(g -> new Object[]{g.getFirstName() + " " + g.getLastName(), amount(d)})
                    .toList()),

        new Def(CODE_CONFORT_HAB, WARRANTY_CONFORT_HAB,
            d -> d.getLoanData() != null && !isAqsTrn(d.getLoanData()),
            d -> args(amount(d))),

        new Def(CODE_ACCORD_FOND, WARRANTY_ACCORD_FOND,
            d -> d.getCodeProduct() != null && conventionProducts.contains(d.getCodeProduct()),
            d -> args()),

        new Def(CODE_ACCEPT_CCG, WARRANTY_ACCEPT_CCG,
            d -> d.getCodeProduct() != null && CCG.contains(d.getCodeProduct().toLowerCase()),
            d -> args()),

        new Def(CODE_HYPOTHEQUE, WARRANTY_HYPOTHEQUE, d -> true, d -> rangArgs(d, true)),
        new Def(CODE_CAUTION_HYPO, WARRANTY_CAUTION_HYPO, d -> true, d -> rangArgs(d, false)),

        new Def(CODE_DOM_SALAIRE, WARRANTY_DOM_SALAIRE,
            d -> hasBorrower(d) && "MAROC".equalsIgnoreCase(country(d))
                    && (market(d).contains(MCH_01) || market(d).contains(MCH_09_PRI)),
            d -> args()),

        new Def(CODE_DOM_REVENUS, WARRANTY_DOM_REVENUS,
            d -> hasBorrower(d) && !(market(d).contains(MCH_01) || market(d).contains(MCH_09_PRI))
                    && (market(d).contains(MCH_02) || market(d).contains(MCH_03) || market(d).contains(MCH_09_PRO)),
            d -> args())
    );

    // ---------- المحرك ----------
    public void generateDefaultWarranties(DossierDataCoreDto d) {
        if (d == null || d.getCodeProduct() == null
                || EXCLUDED.contains(d.getCodeProduct().toLowerCase())
                || (d.getCreatedAt() != null && d.getCreatedAt().isBefore(AUTO_START))) return;

        List<WarrantyDto> all = new ArrayList<>(orEmpty(d.getWarranties()));
        all.removeIf(w -> WarrantyType.AUTO.equals(w.getType()));

        defs.stream().filter(def -> def.when().test(d))
            .flatMap(def -> def.args().apply(d).stream()
                .map(a -> WarrantyDto.builder().code(def.code())
                        .content(String.format(def.template(), a))
                        .type(WarrantyType.AUTO).build()))
            .forEach(all::add);

        d.setWarranties(all);
    }

    // ---------- helpers ----------
    private List<Object[]> rangArgs(DossierDataCoreDto d, boolean borrower) {
        if (d.getPropertyData() == null) return List.of();
        Map<String, PropertyCoreDto> props = new HashMap<>();   // يتبنى مرة وحدة
        orEmpty(d.getPropertyData().getProperties()).stream().filter(Objects::nonNull).forEach(p -> {
            if (p.getId() != null) props.put(p.getId().toString(), p);
            if (p.getUuid() != null) props.put(p.getUuid(), p);
        });
        return orEmpty(d.getBeneficiaries()).stream()
            .filter(b -> Boolean.TRUE.equals(b.getIsBorrower()) == borrower)
            .flatMap(b -> orEmpty(b.getRangs()).stream())
            .map(r -> {
                PropertyCoreDto p = props.get(r.getPropertyId() != null
                        ? String.valueOf(r.getPropertyId()) : r.getPropertyUuid());
                if (p == null) { log.warn("Propriété introuvable pour rang {}", r.getRang()); return null; }
                return new Object[]{r.getRang(), p.getLandCertificateNumber(),
                        MoneyToWords.formatAmount(r.getWarrantyAmount())};
            })
            .filter(Objects::nonNull).toList();
    }

    private static boolean hasBorrower(DossierDataCoreDto d) {
        return orEmpty(d.getBeneficiaries()).stream().anyMatch(b -> Boolean.TRUE.equals(b.getIsBorrower()));
    }
    private static String market(DossierDataCoreDto d) {
        return Optional.ofNullable(d.getCustomerData()).map(c -> c.getCard()).map(c -> c.getMarket()).orElse("");
    }
    private static String country(DossierDataCoreDto d) {
        return Optional.ofNullable(d.getCustomerData()).map(c -> c.getCard()).map(c -> c.getResidenceCountry()).orElse("");
    }
    private static boolean isAqsTrn(LoanDataCoreDto l) {
        return "AQS".equals(l.getCodeLoanObject()) && "TRN".equals(l.getCodePropertyType());
    }
    private static String amount(DossierDataCoreDto d) { return MoneyToWords.formatAmount(d.getLoanData().getLoanAmount()); }
    private static List<Object[]> args(Object... a) { return List.<Object[]>of(a); }
    private static <T> List<T> orEmpty(List<T> l) { return l == null ? List.of() : l; }
    private static Set<String> lower(ProductCode... c) {
        return Arrays.stream(c).map(p -> p.toString().toLowerCase()).collect(Collectors.toSet());
    }
}




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
