package ma.sg.its.octroicreditcore.strategy;

import ma.sg.its.octroicreditcore.dto.*;
import ma.sg.its.octroicreditcore.exception.FunctionalException;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.mapper.BeneficiaryMapper;
import ma.sg.its.octroicreditcore.mapper.GuarantorMapper;
import ma.sg.its.octroicreditcore.mapper.PropertyMapper;
import ma.sg.its.octroicreditcore.model.*;
import ma.sg.its.octroicreditcore.model.comments.Comment;
import ma.sg.its.octroicreditcore.service.UserService;
import org.apache.commons.collections.CollectionUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;


@Component
public class DossierCreationHelper {

    @Autowired
    private PropertyMapper propertyMapper;

    @Autowired
    private BeneficiaryMapper beneficiaryMapper;

    @Autowired
    private GuarantorMapper guarantorMapper;


    public void linkPropertiesToBeneficiaries(DossierDataDto dto, DossierData existingDossier, Map<String, Beneficiary> beneficiaryPool) {
        initializeCollections(existingDossier);
        Map<String, Property> propertyPool = new HashMap<>();

        if (dto.getPropertyData() != null && dto.getPropertyData().getProperties() != null) {
            processProperties(dto.getPropertyData().getProperties(), existingDossier, propertyPool);
        }else{
            existingDossier.getProperties().clear();
        }

        if (dto.getBeneficiaries() != null) {
            syncBeneficiaries(dto.getBeneficiaries(), existingDossier, propertyPool, beneficiaryPool);
        }else {
            existingDossier.getBeneficiaries().clear();
        }
    }

    void processProperties(List<PropertyDto> propDtos, DossierData dossier, Map<String, Property> pool) {
        if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());

        Map<Long, PropertyDto> dtoMap = propDtos.stream()
                .filter(p -> p.getId() != null)
                .collect(Collectors.toMap(PropertyDto::getId, p -> p));
        dossier.getProperties().stream()
                .filter(p -> p.getId() != null && !dtoMap.containsKey(p.getId()))
                .forEach(removedProp -> {
                    dossier.getBeneficiaries().forEach(benef ->
                            benef.getRangs().removeIf(r ->
                                    r.getProperty() != null && removedProp.getId().equals(r.getProperty().getId())
                            )
                    );
                });
        dossier.getProperties().removeIf(p -> p.getId() != null && !dtoMap.containsKey(p.getId()));

        for (PropertyDto pDto : propDtos) {
            Property property;
            if (pDto.getId() != null) {
                Optional<Property> existing = dossier.getProperties().stream()
                        .filter(p -> p.getId().equals(pDto.getId()))
                        .findFirst();

                if (existing.isPresent()) {
                    property = existing.get();
                    propertyMapper.updateFromDto(pDto, property); // update existing only
                } else {
                    // Cas rare — nouvelle property avec ID (vient d'ailleurs)
                    property = propertyMapper.convertToEntity(pDto);
                    property.setDossier(dossier);
                    dossier.getProperties().add(property);
                }
            } else {
                property = propertyMapper.convertToEntity(pDto);
                property.setDossier(dossier);
                dossier.getProperties().add(property);
            }
            fillPropertyPool(property, pDto, pool);
        }

    }

    void fillPropertyPool(Property p, PropertyDto dto, Map<String, Property> pool) {
        if (dto.getId() != null) {
            pool.put(dto.getId().toString(), p);
        }
        if (dto.getUuid() != null) {
            pool.put(dto.getUuid(), p);
        }
    }

    void syncBeneficiaries(List<BeneficiaryDto> dtos, DossierData dossier, Map<String, Property> pool, Map<String, Beneficiary> beneficiaryPool) {
        if (dossier.getBeneficiaries() == null) dossier.setBeneficiaries(new ArrayList<>());

        Map<Long, BeneficiaryDto> dtoMap = dtos.stream()
                .filter(p -> p.getId() != null)
                .collect(Collectors.toMap(BeneficiaryDto::getId, p -> p));

        dossier.getBeneficiaries().stream()
                .filter(b -> b.getId() != null && !dtoMap.containsKey(b.getId()))
                .forEach(b -> b.getRangs().clear());


        dossier.getBeneficiaries().removeIf(p -> p.getId() != null && !dtoMap.containsKey(p.getId()));

        dossier.getBeneficiaries().forEach(benef -> {
            if(dtoMap.containsKey(benef.getId())){
                BeneficiaryDto bDto = dtoMap.get(benef.getId());
                beneficiaryMapper.updateFromDto(bDto, benef);
                benef.syncProperties(bDto.getProperties(), pool);
                benef.syncRangs(bDto.getRangs(), pool);
                if (benef.getId() != null) {
                    beneficiaryPool.put(benef.getId().toString(), benef);
                }
                if (benef.getUuid() != null) {
                    beneficiaryPool.put(benef.getUuid(), benef);
                }
            }
        });

        for (BeneficiaryDto bDto : dtos) {
                boolean alreadyExists = dossier.getBeneficiaries().stream()
                        .anyMatch(b -> b.getId() == null && bDto.getUuid() != null && bDto.getUuid().equals(b.getUuid()));

                if (!alreadyExists) {
                    Beneficiary beneficiary = beneficiaryMapper.convertToEntity(bDto);
                    beneficiary.setDossier(dossier);
                    beneficiary.syncProperties(bDto.getProperties(), pool);
                    beneficiary.syncRangs(bDto.getRangs(), pool);
                    beneficiary.setId(null);
                    dossier.getBeneficiaries().add(beneficiary);
                    if (bDto.getId() != null) {
                        beneficiaryPool.put(bDto.getId().toString(), beneficiary);
                    }
                    if (bDto.getUuid() != null) {
                        beneficiaryPool.put(bDto.getUuid(), beneficiary);
                    }
                }
        }
    }

    void initializeCollections(DossierData dossier) {
        if (dossier.getBeneficiaries() == null) dossier.setBeneficiaries(new ArrayList<>());
        if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());
    }

    public void syncGuarantors(DossierDataDto newDossier, DossierData dossier, Map<String, Guarantor> guarantorPool) {
        if (CollectionUtils.isEmpty(newDossier.getGuarantors())) {
            dossier.getGuarantors().clear();
            return;
        }
        Map<Long, GuarantorDto> incomingIds = newDossier.getGuarantors().stream()
                .filter(r -> r.getId() != null)
                .collect(Collectors.toMap(GuarantorDto::getId, r -> r));

        dossier.getGuarantors().removeIf(r -> r.getId() != null && !incomingIds.containsKey(r.getId()));

        dossier.getGuarantors().forEach(rep -> {
            if(incomingIds.containsKey(rep.getId())){
                GuarantorDto repDto = incomingIds.get(rep.getId());
                guarantorMapper.updateFromDto(repDto, rep);
                if (rep.getId() != null) {
                    guarantorPool.put(rep.getId().toString(), rep);
                }
                if (rep.getUuid() != null) {
                    guarantorPool.put(rep.getUuid(), rep);
                }
            }
        });

        for (GuarantorDto repDto : newDossier.getGuarantors()) {
            Guarantor guarantor = guarantorMapper.convertToEntity(repDto);
            guarantor.setDossier(dossier);
            guarantor.setId(null);
            dossier.getGuarantors().add(guarantor);

            if (repDto.getId() != null) {
                guarantorPool.put(repDto.getId().toString(), guarantor);
            }
            if (repDto.getUuid() != null) {
                guarantorPool.put(repDto.getUuid(), guarantor);
            }
        }
    }

    public void syncRepresentatives(DossierDataDto newDossier, DossierData dossier, Map<String, Guarantor> guarantorPool, Map<String, Beneficiary> beneficiaryPool) {
        if (CollectionUtils.isEmpty(newDossier.getRepresentatives())) {
            clearAllRepresentativeReferences(dossier);
            dossier.getRepresentatives().clear();
            return;
        }
        Set<Long> incomingIds = newDossier.getRepresentatives().stream()
                .map(RepresentativeDto::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        dossier.getRepresentatives().removeIf(r -> r.getId() != null && !incomingIds.contains(r.getId()));

        Map<Long, Representative> existingById = dossier.getRepresentatives().stream()
                .filter(r -> r.getId() != null)
                .collect(Collectors.toMap(Representative::getId, r -> r));

        for (RepresentativeDto repDto : newDossier.getRepresentatives()) {
            Representative rep = upsertRepresentative(repDto, existingById, dossier);
            linkRepresentativeRelationships(repDto, rep, dossier, guarantorPool, beneficiaryPool);
        }
    }

    private static Representative upsertRepresentative(
            RepresentativeDto dto,
            Map<Long, Representative> existingById,
            DossierData dossier) {

        Representative rep;

        if (dto.getId() != null && existingById.containsKey(dto.getId())) {
            rep = existingById.get(dto.getId());
            rep.unlinkAllBeneficiaries();
            rep.unlinkAllGuarantors();
            rep.unlinkAllCustomers();
        } else {
            rep = new Representative();
            rep.setDossier(dossier);
            dossier.getRepresentatives().add(rep);
        }

        rep.setFirstname(dto.getFirstname());
        rep.setLastname(dto.getLastname());
        rep.setCin(dto.getCin());
        rep.setCinIssuedAt(dto.getCinIssuedAt());

        return rep;
    }

    private static void linkRepresentativeRelationships(
            RepresentativeDto dto,
            Representative entity,
            DossierData dossier, Map<String, Guarantor> guarantorPool, Map<String, Beneficiary> beneficiaryPool) {

        linkCustomerRelationship(dto, entity, dossier);
        linkBeneficiaryRelationships(dto, entity, dossier, beneficiaryPool);
        linkGuarantorRelationships(dto, entity, dossier, guarantorPool);
    }

    private static void linkCustomerRelationship(RepresentativeDto dto, Representative entity, DossierData dossier) {
        if (dto.getCustomer() == null || dossier.getCustomerData() == null) {
            return;
        }

        Customer customer = dossier.getCustomerData().getCustomer();
        LocalDate proxyDate = dto.getCustomer().getProxyDate();

        if (customer != null && proxyDate != null) {
            entity.linkCustomer(customer, proxyDate);
        }
    }

    private static void linkBeneficiaryRelationships(RepresentativeDto dto, Representative entity, DossierData dossier, Map<String, Beneficiary> beneficiaryPool) {
        if (CollectionUtils.isEmpty(dto.getBeneficiaries()) || CollectionUtils.isEmpty(dossier.getBeneficiaries())) {
            return;
        }
        if (entity.getBeneficiaryAssociations() == null) {
            entity.setBeneficiaryAssociations(new ArrayList<>());
        } else {
            entity.getBeneficiaryAssociations().clear();
        }
        dto.getBeneficiaries().forEach(ben -> {
            if(ben.getBeneficiary() == null) return;
            String key =  ben.getBeneficiary().getId() != null ? ben.getBeneficiary().getId().toString()
                    : (ben.getBeneficiary().getUuid() != null ? ben.getBeneficiary().getUuid() :null);
            if(key != null) {
                Beneficiary beneficiary = beneficiaryPool.get(key);
                if(beneficiary == null) return;
                RepresentativeBeneficiary association = new RepresentativeBeneficiary();
                association.setRepresentative(entity);
                association.setBeneficiary(beneficiary);
                association.setProxyDate(ben.getProxyDate());
                entity.getBeneficiaryAssociations().add(association);
            }
        });
    }

    private static void linkGuarantorRelationships(RepresentativeDto dto, Representative entity, DossierData dossier, Map<String, Guarantor> guarantorPool) {
        if (CollectionUtils.isEmpty(dto.getGuarantors()) || CollectionUtils.isEmpty(dossier.getGuarantors())) {
            return;
        }

        if (entity.getGuarantorAssociations() == null) {
            entity.setGuarantorAssociations(new ArrayList<>());
        } else {
            entity.getGuarantorAssociations().clear();
        }
        dto.getGuarantors().forEach(guar -> {
            if(guar.getGuarantor() == null) return;
            String key = guar.getGuarantor().getId() != null ? guar.getGuarantor().getId().toString()
                    : (guar.getGuarantor().getUuid() != null ? guar.getGuarantor().getUuid() : null);
            if(key != null) {
                Guarantor requestGuarantor = guarantorPool.get(key);
                if(requestGuarantor == null) return;
                RepresentativeGuarantor association = new RepresentativeGuarantor();
                association.setRepresentative(entity);
                association.setGuarantor(requestGuarantor);
                association.setProxyDate(guar.getProxyDate());
                entity.getGuarantorAssociations().add(association);
            }
        });
    }

    private static void clearAllRepresentativeReferences(DossierData dossier) {
        if (dossier.getRepresentatives() != null) {
            dossier.getRepresentatives().forEach(rep -> {
                rep.unlinkAllBeneficiaries();
                rep.unlinkAllGuarantors();
                rep.unlinkAllCustomers();
            });
        }
    }
}
