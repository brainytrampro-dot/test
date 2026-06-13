// maake full test coverage for DossierCreationHelper

package ma.sg.its.octroicreditcore.strategy;

import ma.sg.its.octroicreditcore.dto.*;
import ma.sg.its.octroicreditcore.mapper.BeneficiaryMapper;
import ma.sg.its.octroicreditcore.mapper.GuarantorMapper;
import ma.sg.its.octroicreditcore.mapper.PropertyMapper;
import ma.sg.its.octroicreditcore.model.*;
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


    public void syncProperties(DossierDataDto newDossier, DossierData dossier, Map<String, Property> propertyPool) {
        List<PropertyDto> propertyDtos = newDossier.getPropertyData() != null ? newDossier.getPropertyData().getProperties() : new ArrayList<>();
        if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());
        if (CollectionUtils.isEmpty(propertyDtos)) {
            dossier.getProperties().clear();
            return;
        }
        Map<Long, PropertyDto> dtoMap = newDossier.getPropertyData().getProperties().stream()
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

        dossier.getProperties().forEach(prop -> {
            if(dtoMap.containsKey(prop.getId())){
                PropertyDto pDto = dtoMap.get(prop.getId());
                propertyMapper.updateFromDto(pDto, prop);
                if (pDto.getId() != null) {
                    propertyPool.put(pDto.getId().toString(), prop);
                }
                if (pDto.getUuid() != null) {
                    propertyPool.put(pDto.getUuid(), prop);
                }
            }
        });

        for (PropertyDto pDto : propertyDtos) {
            if (pDto.getId() == null || dossier.getId() == null) {
                Property property = propertyMapper.convertToEntity(pDto);
                if (dossier.getId() == null) {
                    property.setId(null);
                }
                property.setDossier(dossier);
                dossier.getProperties().add(property);
                if (pDto.getId() != null) {
                    propertyPool.put(pDto.getId().toString(), property);
                }
                if (pDto.getUuid() != null) {
                    propertyPool.put(pDto.getUuid(), property);
                }
            }
        }
    }
    public void syncBeneficiaries(DossierDataDto newDossier, DossierData dossier, Map<String, Property> pool, Map<String, Beneficiary> beneficiaryPool) {
        if (dossier.getBeneficiaries() == null) dossier.setBeneficiaries(new ArrayList<>());
        if (CollectionUtils.isEmpty(newDossier.getBeneficiaries())) {
            dossier.getBeneficiaries().clear();
            return;
        }
        Map<Long, BeneficiaryDto> dtoMap = newDossier.getBeneficiaries().stream()
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

        for (BeneficiaryDto bDto : newDossier.getBeneficiaries()) {
            if (bDto.getId() == null || dossier.getId() == null) {
                Beneficiary beneficiary = beneficiaryMapper.convertToEntity(bDto);
                if (dossier.getId() == null) {
                    beneficiary.setId(null);
                }
                beneficiary.setDossier(dossier);
                beneficiary.syncProperties(bDto.getProperties(), pool);
                beneficiary.syncRangs(bDto.getRangs(), pool);
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
    public void syncGuarantors(DossierDataDto newDossier, DossierData dossier, Map<String, Guarantor> guarantorPool) {
        if (dossier.getGuarantors() == null) dossier.setGuarantors(new ArrayList<>());
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
            if (repDto.getId() == null || dossier.getId() == null) {
                Guarantor guarantor = guarantorMapper.convertToEntity(repDto);
                if (dossier.getId() == null) {
                    guarantor.setId(null);
                }
                guarantor.setDossier(dossier);
                dossier.getGuarantors().add(guarantor);

                if (repDto.getId() != null) {
                    guarantorPool.put(repDto.getId().toString(), guarantor);
                }
                if (repDto.getUuid() != null) {
                    guarantorPool.put(repDto.getUuid(), guarantor);
                }
            }
        }
    }
    public void syncRepresentatives(DossierDataDto newDossier, DossierData dossier, Map<String, Guarantor> guarantorPool, Map<String, Beneficiary> beneficiaryPool) {
        if (CollectionUtils.isEmpty(newDossier.getRepresentatives())) {
            clearAllRepresentativeReferences(dossier);
            if (dossier.getRepresentatives() != null) {
                dossier.getRepresentatives().clear();
            }
            return;
        }

        Set<Long> incomingIds = dossier.getId() == null ? Collections.emptySet() : newDossier.getRepresentatives().stream()
                .map(RepresentativeDto::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        if (dossier.getId() != null && dossier.getRepresentatives() != null) {
            dossier.getRepresentatives().removeIf(r -> r.getId() != null && !incomingIds.contains(r.getId()));
        }

        Map<Long, Representative> existingById = (dossier.getId() == null || dossier.getRepresentatives() == null)
                ? Collections.emptyMap()
                : dossier.getRepresentatives().stream()
                .filter(r -> r.getId() != null)
                .collect(Collectors.toMap(Representative::getId, r -> r));

        for (RepresentativeDto repDto : newDossier.getRepresentatives()) {
            Representative rep = upsertRepresentative(repDto, existingById, dossier);
            linkRepresentativeRelationships(repDto, rep, dossier, guarantorPool, beneficiaryPool);
        }
    }
    private Representative upsertRepresentative(RepresentativeDto dto, Map<Long, Representative> existingById, DossierData dossier) {
        Representative rep;

        if (dossier.getId() != null && dto.getId() != null && existingById.containsKey(dto.getId())) {
            rep = existingById.get(dto.getId());
            rep.unlinkAllBeneficiaries();
            rep.unlinkAllGuarantors();
            rep.unlinkAllCustomers();
        } else {
            rep = new Representative();
            if (dossier.getId() == null) {
                rep.setId(null);
            }
            rep.setDossier(dossier);
            if (dossier.getRepresentatives() == null) {
                dossier.setRepresentatives(new ArrayList<>());
            }
            dossier.getRepresentatives().add(rep);
        }

        rep.setFirstname(dto.getFirstname());
        rep.setLastname(dto.getLastname());
        rep.setCin(dto.getCin());
        rep.setCinIssuedAt(dto.getCinIssuedAt());

        return rep;
    }


    private void linkRepresentativeRelationships(
            RepresentativeDto dto,
            Representative entity,
            DossierData dossier, Map<String, Guarantor> guarantorPool, Map<String, Beneficiary> beneficiaryPool) {

        linkCustomerRelationship(dto, entity, dossier);
        linkBeneficiaryRelationships(dto, entity, dossier, beneficiaryPool);
        linkGuarantorRelationships(dto, entity, dossier, guarantorPool);
    }

    private void linkCustomerRelationship(RepresentativeDto dto, Representative entity, DossierData dossier) {
        if (dto.getCustomer() == null || dossier.getCustomerData() == null) {
            return;
        }

        Customer customer = dossier.getCustomerData().getCustomer();
        LocalDate proxyDate = dto.getCustomer().getProxyDate();

        if (customer != null && proxyDate != null) {
            entity.linkCustomer(customer, proxyDate);
        }
    }

    private void linkBeneficiaryRelationships(RepresentativeDto dto, Representative entity, DossierData dossier, Map<String, Beneficiary> beneficiaryPool) {
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

    private void linkGuarantorRelationships(RepresentativeDto dto, Representative entity, DossierData dossier, Map<String, Guarantor> guarantorPool) {
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

    private void clearAllRepresentativeReferences(DossierData dossier) {
        if (dossier.getRepresentatives() != null) {
            dossier.getRepresentatives().forEach(rep -> {
                rep.unlinkAllBeneficiaries();
                rep.unlinkAllGuarantors();
                rep.unlinkAllCustomers();
            });
        }
    }
}


package ma.sg.its.octroicreditcore.strategy;

import ma.sg.its.octroicreditcore.dto.DebtDto;
import ma.sg.its.octroicreditcore.dto.DebtInfnDto;
import ma.sg.its.octroicreditcore.dto.DossierDataDto;
import ma.sg.its.octroicreditcore.dto.DossierUserDto;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.mapper.DebtInfonMapper;
import ma.sg.its.octroicreditcore.mapper.DebtMapper;
import ma.sg.its.octroicreditcore.mapper.DossierDataMapper;
import ma.sg.its.octroicreditcore.model.*;
import ma.sg.its.octroicreditcore.repository.*;
import ma.sg.its.octroicreditcore.service.UserService;
import ma.sg.its.octroicreditcore.util.Assert;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

@Service("customer")
public class DossierCreationCustomerService extends DossierCreation {

    @Autowired
    private CustomerCardRepository customerCardRepository;
    @Autowired
    private CustomerRepository customerRepository;
    @Autowired
    private DossierDataRepository dossierDataRepository;
    @Autowired
    private DossierDataMapper dossierDataMapper;
    @Autowired
    private DebtRepository debtRepository;
    @Autowired
    private DebtInfonRepository debtInfonRepository;
    @Autowired
    private DebtInfonMapper debtInfonMapper;
    @Autowired
    private DebtMapper debtMapper;
    @Autowired
    private DossierCreationHelper dossierCreationHelper;
    @Override
    public DossierDataDto create(DossierDataDto dossierDto) {
        Assert.isNull(dossierDto.getUuid(), "Dossier already created");
        DossierOrganization dossierOrganization = getDossierOrganization(dossierDto);
        DossierData dossier = convertToEntity(dossierDto);
        dossier.setDossierOrganization(dossierOrganization);
        String customerCode = dossierDto.getCustomerData().getCustomer().getCode();
        List<CustomerCard> customerCards = customerCardRepository.findByCustomer_Code(customerCode);
        CustomerCard customerCard = customerCards.stream().filter(item -> item.equals(dossier.getCustomerData())).findFirst().orElse(null);
        if (customerCard != null) {
            dossier.setCustomerData(customerCard);
        } else {
            Customer customer = customerRepository.findByCode(customerCode);
            if (dossier.getCustomerData() != null && customer != null) {
                dossier.getCustomerData().setCustomer(customer);
            }
        }
        Assert.notNull(dossier.getCustomerData(), "CustomerCard is mandatory");
        addCustomerDebts(dossierDto, dossier);
        addDossierUser(dossierDto, dossier);

      // FIX!!! SONAR  Duplicated block. Click for details.

        Map<String, Beneficiary> beneficiaryPool = new HashMap<>();
        Map<String, Guarantor> guarantorPool = new HashMap<>();
        Map<String, Property> propertyPool = new HashMap<>();
        dossier.setProperties(new ArrayList<>());
        dossier.setBeneficiaries(new ArrayList<>());
        dossier.setGuarantors(new ArrayList<>());
        dossier.setRepresentatives(new ArrayList<>());
        dossierCreationHelper.syncProperties(dossierDto, dossier, propertyPool);
        dossierCreationHelper.syncBeneficiaries(dossierDto, dossier, propertyPool, beneficiaryPool);
        dossierCreationHelper.syncGuarantors(dossierDto, dossier, guarantorPool);
        dossierCreationHelper.syncRepresentatives(dossierDto, dossier, guarantorPool, beneficiaryPool);
        prepareDossier(dossier);

        DossierData saved = dossierDataRepository.save(dossier);
        return convertToDto(saved);
    }

    private void addCustomerDebts(DossierDataDto dossierDto, DossierData dossier) {
        List<DebtDto> debtDtos = dossierDto.getDebts();
        List<Debt> debts = new ArrayList<>();
        if (debtDtos != null && !debtDtos.isEmpty()) {
            debtDtos.stream().forEach(debtDto -> {
                List<Debt> optDebt = debtRepository.findLastCreatedDebtByFileNumberAndRemainingCapital(debtDto.getFileNumber(), debtDto.getRemainingCapital());
                if (!CollectionUtils.isEmpty(optDebt)) {
                    debts.add(optDebt.get(0));
                } else {
                    Debt debt = debtRepository.save(debtMapper.convertToEntity(debtDto));
                    debts.add(debt);
                }
            });
        }
        if (!debts.isEmpty()) dossier.setDebts(debts);

        List<DebtInfnDto> debtInfnDto = dossierDto.getDebtsinfon();
        List<DebtInfon> debtsInfon = new ArrayList<>();
        if (debtInfnDto != null && !debtInfnDto.isEmpty()) {
            debtInfnDto.stream().forEach(debtInfonDto -> {
                DebtInfon debtInfon = debtInfonRepository.save(debtInfonMapper.convertToEntity(debtInfonDto));
                debtsInfon.add(debtInfon);
            });
        }
        if (!debtsInfon.isEmpty()) dossier.setDebtsinfon(debtsInfon);
        if (dossier.getLoanData() != null) {
            dossier.getLoanData().setIsExternDebtsInfnRetrieved(Boolean.FALSE);
        }
    }

    private DossierData convertToEntity(DossierDataDto dossierDataDto) {
        return dossierDataMapper.convertToEntity(dossierDataDto);
    }

    private DossierDataDto convertToDto(DossierData dossierData) {
        DossierDataDto dossierDataDto = dossierDataMapper.convertToDTO(dossierData);
        dossierDataDto.setCodeDossier(StringUtils.leftPad(dossierData.getId().toString(), 8, "0"));
        return dossierDataDto;
    }
}


package ma.sg.its.octroicreditcore.strategy;

import ma.sg.its.octroicreditcore.dto.CustomerCardDto;
import ma.sg.its.octroicreditcore.dto.DossierDataDto;
import ma.sg.its.octroicreditcore.dto.DossierUserDto;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.mapper.CustomerMapper;
import ma.sg.its.octroicreditcore.mapper.DossierDataMapper;
import ma.sg.its.octroicreditcore.model.*;
import ma.sg.its.octroicreditcore.repository.CustomerCardRepository;
import ma.sg.its.octroicreditcore.repository.DossierDataRepository;
import ma.sg.its.octroicreditcore.service.UserService;
import ma.sg.its.octroicreditcore.util.Assert;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

import static ma.sg.its.octroicreditcore.constant.ErrorsConstants.DOSSIER_DATA_NOT_FOUND_DSC;

@Service("prospect")
public class DossierCreationProspectService extends DossierCreation {

    @Autowired
    private DossierDataRepository dossierDataRepository;
    @Autowired
    private CustomerCardRepository customerCardRepository;
    @Autowired
    private DossierDataMapper dossierDataMapper;
    @Autowired
    private CustomerMapper customerMapper;
    @Autowired
    private DossierCreationHelper dossierCreationHelper;

    @Override
    public DossierDataDto create(DossierDataDto dossierDto) {
        if (dossierDto == null) {
            throw new TechnicalException(DOSSIER_DATA_NOT_FOUND_DSC);
        }
        Assert.isNull(dossierDto.getUuid(), "Dossier already created");
        Customer customer = createProspect(dossierDto.getCustomerData());
        DossierOrganization dossierOrganization = getDossierOrganization(dossierDto);
        DossierData dossier = convertToEntity(dossierDto);
        dossier.setDossierOrganization(dossierOrganization);
        List<CustomerCard> customerCards = customerCardRepository.findByCustomer_CardId(dossierDto.getCustomerData().getCustomer().getCardId());
        CustomerCard customerCard = customerCards.stream().filter(item -> item.equals(dossier.getCustomerData())).findFirst().orElse(null);
        if (customerCard != null) {
            dossier.setCustomerData(customerCard);
        } else {
            if (dossier.getCustomerData() != null && customer != null) {
                dossier.getCustomerData().setCustomer(customer);
            }
        }
        Assert.notNull(dossier.getCustomerData(), "CustomerCard is mandatory");
        addDossierUser(dossierDto, dossier);
            // FIX!!! SONAR  Duplicated block. Click for details.

        Map<String, Beneficiary> beneficiaryPool = new HashMap<>();
        Map<String, Guarantor> guarantorPool = new HashMap<>();
        Map<String, Property> propertyPool = new HashMap<>();
        dossier.setProperties(new ArrayList<>());
        dossier.setBeneficiaries(new ArrayList<>());
        dossier.setGuarantors(new ArrayList<>());
        dossier.setRepresentatives(new ArrayList<>());
        dossierCreationHelper.syncProperties(dossierDto, dossier, propertyPool);
        dossierCreationHelper.syncBeneficiaries(dossierDto, dossier, propertyPool, beneficiaryPool);
        dossierCreationHelper.syncGuarantors(dossierDto, dossier, guarantorPool);
        dossierCreationHelper.syncRepresentatives(dossierDto, dossier, guarantorPool, beneficiaryPool);
        prepareDossier(dossier);
        DossierData saved = dossierDataRepository.save(dossier);

        return convertToDto(saved);
    }

    private DossierData convertToEntity(DossierDataDto dossierDataDto) {
        return dossierDataMapper.convertToEntity(dossierDataDto);
    }

    private DossierDataDto convertToDto(DossierData dossierData) {
        DossierDataDto dossierDataDto = dossierDataMapper.convertToDTO(dossierData);
        dossierDataDto.setCodeDossier(StringUtils.leftPad(dossierData.getId().toString(), 8, "0"));
        return dossierDataDto;
    }
    private Customer createProspect(CustomerCardDto customerCardDto) {
        CustomerCard customerCard = customerMapper.convertCustomerCardToEntity(customerCardDto);
        customerCardRepository.save(customerCard);
        return customerCard.getCustomer();
    }
}



