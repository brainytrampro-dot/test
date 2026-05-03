// ─── Service methods ─────────────────────────────────────────────────────────

private void linkPropertiesToBeneficiaries(DossierDataDto dto, DossierData existingDossier) {
    initializeCollections(existingDossier);
    Map<String, Property> propertyPool = new HashMap<>();

    if (dto.getPropertyData() != null && dto.getPropertyData().getProperties() != null) {
        processProperties(dto.getPropertyData().getProperties(), existingDossier, propertyPool);
    }

    if (dto.getBeneficiaries() != null) {
        syncBeneficiaries(dto.getBeneficiaries(), existingDossier, propertyPool);
    }
}

private void processProperties(List<PropertyDto> propDtos, DossierData dossier, Map<String, Property> pool) {
    if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());

    Map<Long, PropertyDto> dtoMap = propDtos.stream()
            .filter(p -> p.getId() != null)
            .collect(Collectors.toMap(PropertyDto::getId, p -> p));

    dossier.getProperties().removeIf(p -> p.getId() != null && !dtoMap.containsKey(p.getId()));

    for (PropertyDto pDto : propDtos) {
        Property property;
        if (pDto.getId() != null) {
            property = dossier.getProperties().stream()
                    .filter(p -> p.getId().equals(pDto.getId()))
                    .findFirst()
                    .orElseGet(() -> propertyMapper.convertToEntity(pDto));
            propertyMapper.updateFromDto(pDto, property);
        } else {
            property = propertyMapper.convertToEntity(pDto);
            property.setDossier(dossier);
            dossier.getProperties().add(property);
        }

        // Les rangs ne sont plus gérés ici — ils sont gérés par benef dans syncBeneficiaries
        fillPropertyPool(property, pDto, pool);
    }
}

private void syncBeneficiaries(List<BeneficiaryDto> dtos, DossierData dossier, Map<String, Property> pool) {
    if (dossier.getBeneficiaries() == null) dossier.setBeneficiaries(new ArrayList<>());

    Map<Long, BeneficiaryDto> dtoMap = dtos.stream()
            .filter(b -> b.getId() != null)
            .collect(Collectors.toMap(BeneficiaryDto::getId, b -> b));

    // Supprime les benefs absents du DTO
    dossier.getBeneficiaries().removeIf(b -> b.getId() != null && !dtoMap.containsKey(b.getId()));

    // Update les benefs existants
    dossier.getBeneficiaries().forEach(benef -> {
        if (dtoMap.containsKey(benef.getId())) {
            BeneficiaryDto bDto = dtoMap.get(benef.getId());
            beneficiaryMapper.updateFromDto(bDto, benef);
            benef.syncProperties(bDto.getProperties(), pool);
            // Sync rangs — liste plate, chaque RangDto a propertyId ou propertyUuid
            benef.syncRangs(bDto.getRangs(), pool);
        }
    });

    // Crée les nouveaux benefs
    for (BeneficiaryDto bDto : dtos) {
        if (bDto.getId() == null) {
            boolean alreadyExists = dossier.getBeneficiaries().stream()
                    .anyMatch(b -> b.getId() == null
                            && bDto.getUuid() != null
                            && bDto.getUuid().equals(b.getUuid()));

            if (!alreadyExists) {
                Beneficiary beneficiary = beneficiaryMapper.convertToEntity(bDto);
                beneficiary.syncProperties(bDto.getProperties(), pool);
                beneficiary.setDossier(dossier);
                dossier.getBeneficiaries().add(beneficiary);
                // Sync rangs pour le nouveau benef
                beneficiary.syncRangs(bDto.getRangs(), pool);
            }
        }
    }
}

private void fillPropertyPool(Property p, PropertyDto dto, Map<String, Property> pool) {
    if (dto == null) return;
    String key = dto.getId() != null
            ? dto.getId().toString()
            : (dto.getUuid() != null ? dto.getUuid() : null);
    if (key != null) pool.put(key, p);
}

private void initializeCollections(DossierData dossier) {
    if (dossier.getBeneficiaries() == null) dossier.setBeneficiaries(new ArrayList<>());
    if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());
}
