private void linkRepresentativeRelationships(
        RepresentativeDto dto,
        Representative entity,
        DossierData dossier,
        Map<String, Beneficiary> beneficiaryPool,
        Map<String, Guarantor> guarantorPool) {

    linkCustomerRelationship(dto, entity, dossier);
    linkBeneficiaryRelationships(dto, entity, beneficiaryPool);
    linkGuarantorRelationships(dto, entity, guarantorPool);
}

private void linkBeneficiaryRelationships(
        RepresentativeDto dto,
        Representative entity,
        Map<String, Beneficiary> beneficiaryPool) {

    if (CollectionUtils.isEmpty(dto.getBeneficiaries())) return;

    dto.getBeneficiaries().forEach(benDto -> {
        if (benDto.getBeneficiary() == null || benDto.getProxyDate() == null) return;
        String key = benDto.getBeneficiary().getId() != null
                ? benDto.getBeneficiary().getId().toString()
                : benDto.getBeneficiary().getUuid();
        Beneficiary b = beneficiaryPool.get(key);
        if (b != null) {
            entity.linkBeneficiary(b, benDto.getProxyDate());
        } else {
            log.warn("Beneficiary {} non trouvé dans pool", key);
        }
    });
}

private void linkGuarantorRelationships(
        RepresentativeDto dto,
        Representative entity,
        Map<String, Guarantor> guarantorPool) {

    if (CollectionUtils.isEmpty(dto.getGuarantors())) return;

    dto.getGuarantors().forEach(garDto -> {
        if (garDto.getGuarantor() == null || garDto.getProxyDate() == null) return;
        String key = garDto.getGuarantor().getId() != null
                ? garDto.getGuarantor().getId().toString()
                : garDto.getGuarantor().getUuid();
        Guarantor g = guarantorPool.get(key);
        if (g != null) {
            entity.linkGuarantor(g, garDto.getProxyDate());
        } else {
            log.warn("Guarantor {} non trouvé dans pool", key);
        }
    });
}


public void syncRepresentatives(DossierDataDto newDossier, DossierData dossier) {
    if (CollectionUtils.isEmpty(newDossier.getRepresentatives())) {
        clearAllRepresentativeReferences(dossier);
        List<Representative> toDelete = dossier.getRepresentatives().stream()
                .filter(r -> r.getDossierRequest() == null)
                .toList();
        representativeRepository.deleteAll(toDelete);
        dossier.getRepresentatives().removeAll(toDelete);
        dossier.getRepresentatives().forEach(r -> r.setDossier(null));
        dossier.getRepresentatives().clear();
        return;
    }

    Set<Long> incomingIds = newDossier.getRepresentatives().stream()
            .map(RepresentativeDto::getId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());

    // Vrais orphelins → DELETE
    List<Representative> toDelete = dossier.getRepresentatives().stream()
            .filter(r -> r.getDossierRequest() == null
                    && r.getId() != null
                    && !incomingIds.contains(r.getId()))
            .toList();
    representativeRepository.deleteAll(toDelete);
    dossier.getRepresentatives().removeAll(toDelete);

    // Linked à request → UNLINK
    dossier.getRepresentatives().stream()
            .filter(r -> r.getDossierRequest() != null
                    && r.getId() != null
                    && !incomingIds.contains(r.getId()))
            .forEach(r -> r.setDossier(null));
    dossier.getRepresentatives().removeIf(r -> r.getDossier() == null);

    // Build beneficiary + guarantor pool depuis dossier
    Map<String, Beneficiary> beneficiaryPool = dossier.getBeneficiaries().stream()
            .collect(Collectors.toMap(
                    b -> b.getId() != null ? b.getId().toString() : b.getUuid(),
                    b -> b,
                    (b1, b2) -> b1
            ));

    Map<String, Guarantor> guarantorPool = dossier.getGuarantors().stream()
            .collect(Collectors.toMap(
                    g -> g.getId() != null ? g.getId().toString() : g.getUuid(),
                    g -> g,
                    (g1, g2) -> g1
            ));

    Map<Long, Representative> existingById = dossier.getRepresentatives().stream()
            .filter(r -> r.getId() != null)
            .collect(Collectors.toMap(Representative::getId, r -> r));

    for (RepresentativeDto repDto : newDossier.getRepresentatives()) {
        Representative rep = upsertRepresentative(repDto, existingById, dossier);
        linkRepresentativeRelationships(repDto, rep, dossier, beneficiaryPool, guarantorPool);
    }
}



public void syncGuarantors(DossierDataDto newDossier, DossierData dossier) {
    if (newDossier.getGuarantors() == null) {
        List<Guarantor> toDelete = dossier.getGuarantors().stream()
                .filter(g -> g.getDossierRequest() == null)
                .toList();
        guarantorRepository.deleteAll(toDelete);
        dossier.getGuarantors().removeAll(toDelete);
        dossier.getGuarantors().forEach(g -> g.setDossier(null));
        dossier.getGuarantors().clear();
        return;
    }

    Map<Long, GuarantorDto> newDtoMap = newDossier.getGuarantors().stream()
            .filter(dto -> dto.getId() != null)
            .collect(Collectors.toMap(GuarantorDto::getId, dto -> dto));

    // Vrais orphelins → DELETE explicite
    List<Guarantor> toDelete = dossier.getGuarantors().stream()
            .filter(g -> g.getDossierRequest() == null
                    && g.getId() != null
                    && !newDtoMap.containsKey(g.getId()))
            .toList();
    guarantorRepository.deleteAll(toDelete);
    dossier.getGuarantors().removeAll(toDelete);

    // Linked à request → UNLINK
    dossier.getGuarantors().stream()
            .filter(g -> g.getDossierRequest() != null
                    && g.getId() != null
                    && !newDtoMap.containsKey(g.getId()))
            .forEach(g -> g.setDossier(null));
    dossier.getGuarantors().removeIf(g -> g.getDossier() == null);

    // UPDATE existants
    dossier.getGuarantors().forEach(g -> {
        if (g.getId() != null && newDtoMap.containsKey(g.getId())) {
            guarantorMapper.updateFromDto(newDtoMap.get(g.getId()), g);
        }
    });

    // ADD nouveaux
    newDossier.getGuarantors().stream()
            .filter(dto -> dto.getId() == null)
            .map(guarantorMapper::convertToEntity)
            .peek(g -> g.setDossier(dossier))
            .forEach(dossier.getGuarantors()::add);
}




private void syncBeneficiaries(List<BeneficiaryDto> dtos, DossierData dossier, Map<String, Property> pool) {
    if (dossier.getBeneficiaries() == null) dossier.setBeneficiaries(new ArrayList<>());

    Map<Long, BeneficiaryDto> dtoMap = dtos.stream()
            .filter(p -> p.getId() != null)
            .collect(Collectors.toMap(BeneficiaryDto::getId, p -> p));

    // Vrais orphelins → DELETE explicite
    List<Beneficiary> toDelete = dossier.getBeneficiaries().stream()
            .filter(b -> b.getDossierRequest() == null
                    && b.getId() != null
                    && !dtoMap.containsKey(b.getId()))
            .toList();
    beneficiaryRepository.deleteAll(toDelete);
    dossier.getBeneficiaries().removeAll(toDelete);

    // Linked à request → UNLINK
    dossier.getBeneficiaries().stream()
            .filter(b -> b.getDossierRequest() != null
                    && b.getId() != null
                    && !dtoMap.containsKey(b.getId()))
            .forEach(b -> b.setDossier(null));
    dossier.getBeneficiaries().removeIf(b -> b.getDossier() == null);

    // UPDATE existants
    dossier.getBeneficiaries().forEach(benef -> {
        if (dtoMap.containsKey(benef.getId())) {
            BeneficiaryDto bDto = dtoMap.get(benef.getId());
            beneficiaryMapper.updateFromDto(bDto, benef);
            benef.syncProperties(bDto.getProperties(), pool);
            benef.syncRangs(bDto.getRangs(), pool);
            benef.setDossier(dossier);
        }
    });

    // ADD nouveaux
    for (BeneficiaryDto bDto : dtos) {
        if (bDto.getId() == null) {
            boolean alreadyExists = dossier.getBeneficiaries().stream()
                    .anyMatch(b -> b.getId() == null
                            && bDto.getUuid() != null
                            && bDto.getUuid().equals(b.getUuid()));
            if (!alreadyExists) {
                Beneficiary beneficiary = beneficiaryMapper.convertToEntity(bDto);
                beneficiary.setDossier(dossier);
                beneficiary.syncProperties(bDto.getProperties(), pool);
                beneficiary.syncRangs(bDto.getRangs(), pool);
                dossier.getBeneficiaries().add(beneficiary);
            }
        }
    }
}





private void processProperties(List<PropertyDto> propDtos, DossierData dossier, Map<String, Property> pool) {
    if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());

    Map<Long, PropertyDto> dtoMap = propDtos.stream()
            .filter(p -> p.getId() != null)
            .collect(Collectors.toMap(PropertyDto::getId, p -> p));

    // Vrais orphelins → DELETE explicite
    List<Property> toDelete = dossier.getProperties().stream()
            .filter(p -> p.getDossierRequest() == null
                    && p.getId() != null
                    && !dtoMap.containsKey(p.getId()))
            .toList();
    propertyRepository.deleteAll(toDelete);
    dossier.getProperties().removeAll(toDelete);

    // Linked à request → UNLINK
    dossier.getProperties().stream()
            .filter(p -> p.getDossierRequest() != null
                    && p.getId() != null
                    && !dtoMap.containsKey(p.getId()))
            .forEach(p -> p.setDossier(null));
    dossier.getProperties().removeIf(p -> p.getDossier() == null);

    for (PropertyDto pDto : propDtos) {
        if (pDto.getId() != null) {
            Property property = dossier.getProperties().stream()
                    .filter(p -> p.getId() != null && p.getId().equals(pDto.getId()))
                    .findFirst()
                    .orElseGet(() -> {
                        Property newProp = propertyMapper.convertToEntity(pDto);
                        newProp.setDossier(dossier);
                        dossier.getProperties().add(newProp); // ← fix
                        return newProp;
                    });
            propertyMapper.updateFromDto(pDto, property);
            property.setDossier(dossier);
        } else {
            Property property = propertyMapper.convertToEntity(pDto);
            property.setDossier(dossier);
            dossier.getProperties().add(property);
        }
        fillPropertyPool(property, pDto, pool);
    }
}



