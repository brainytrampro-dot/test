package ma.sg.its.octroicreditcore.model;

import jakarta.persistence.*;
import lombok.*;
import ma.sg.its.octroicreditcore.dto.RangDto;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

import java.time.LocalDate;
import java.util.*;
import java.util.function.Predicate;
import java.util.stream.Collectors;

@Entity
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(callSuper = false)
public class Property {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "land_certificate_number")
    private String landCertificateNumber;
    @Column(name = "code_property_city")
    private String codePropertyCity;

    private String descriptionBien;
    private Double propertyArea;
    private String denomination;
    private String propertyType;
    private LocalDate date;
    private String purchaseProof;
    private String reference;
    private Boolean inVsbProgram;
    private String companyName;
    private String capital;
    private String companyAddress;
    private String registerNumber;
    private String areaDelimitation;
    private String deposit;
    private LocalDate cpvDate;
    private String page;
    private String exactAdress;
    private String immoProgramName;
    @Column(name = "for_acquisition")
    private Boolean forAcquisition;
    @ManyToOne
    @JoinColumn(name = "dossierId", referencedColumnName = "id")
    private DossierData dossier;
    @OneToMany(mappedBy = "property", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
    private List<Rang> rangs =  new ArrayList<>();

    /**
     * Synchronise les rangs d'une propriété en évitant les duplications.
     */
    public void syncRangsFromDto(List<RangDto> updatedRangs) {
        if(updatedRangs == null) return;

        Map<Long, RangDto> modified = updatedRangs.stream()
                .filter(r -> r.getId() != null)
                .collect(Collectors.toMap(RangDto::getId, r -> r));

        this.getRangs().removeIf(r -> r.getId() != null && !modified.containsKey(r.getId()));

        for (Rang r : this.getRangs()) {
            RangDto updatedR = modified.get(r.getId());
            if (updatedR != null) {
                r.setRang(updatedR.getRang());
                r.setWarrantyAmount(updatedR.getWarrantyAmount());
            }
        }

        updatedRangs.stream()
            .filter(r -> r.getId() == null)
            .forEach(r -> {
                Rang newR = new Rang();
                newR.setProperty(this);
                newR.setRang(r.getRang());
                newR.setWarrantyAmount(r.getWarrantyAmount());
                this.getRangs().add(newR);
            });
    }

}


package ma.sg.its.octroicreditcore.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(callSuper = false)
public class Rang {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Integer rang;
    private BigDecimal warrantyAmount;
    @ManyToOne
    @JoinColumn(name = "propertyId", referencedColumnName = "id")
    private Property property;

}


package ma.sg.its.octroicreditcore.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.persistence.*;
import ma.sg.its.octroicreditcore.dto.PropertyDto;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "beneficiary")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Beneficiary extends BaseEntity {

    @ManyToMany
    @JoinTable( name = "beneficiary_property", joinColumns = @JoinColumn(name = "beneficiary_id"), inverseJoinColumns = @JoinColumn(name = "property_id") )
    private List<Property> properties;
    private String firstname;
    private String lastname;
    @Column(columnDefinition = "text")
    private String address;
    private String idCardNumber;
    @Column(columnDefinition = "DATE")
    private LocalDate issuedAt;
    private boolean adult;
    private Boolean isGuarantor;
    private Boolean isBorrower;
    private String representativeLastname;
    private String representativeFirstname;
    private LocalDate judgeAuthorizationDate;
    private String codeBirthPlace;
    @Column(columnDefinition = "DATE")
    private LocalDate birthDate;
    @ManyToOne
    @JoinColumn(name = "dossierId", referencedColumnName = "id")
    private DossierData dossier;
    /**
     * Synchronise la table de jointure ManyToMany avec les instances du pool
     */
    public void syncProperties(List<PropertyDto> propertyDtos, Map<String, Property> pool) {
        if (this.properties == null) {
            this.properties = new ArrayList<>();
        }
        this.properties.clear();

        if (propertyDtos != null) {
            for (PropertyDto pd : propertyDtos) {
                String key = pd.getId() != null ? pd.getId().toString() :(pd.getUuid() != null ? pd.getUuid() : null);

                Property pFromPool = pool.get(key);
                if (pFromPool != null) {
                    this.properties.add(pFromPool);
                }
            }
        }
    }
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Beneficiary other = (Beneficiary) o;

        if (this.getId() != null && other.getId() != null) {
            return this.getId().equals(other.getId());
        }
        if (this.getUuid() != null && other.getUuid() != null) {
            return this.getUuid().equalsIgnoreCase(other.getUuid());
        }
        return false;
    }

    @Override
    public int hashCode() {
        if (getId() != null) {
            return getId().hashCode();
        }

        if (getUuid() != null) {
            return getUuid().hashCode();
        }

        return 0;
    }


}


///////////////  SERVICE

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
						.filter(p -> p.getId().equals(pDto.getId())).findFirst()
						.orElseGet(() -> propertyMapper.convertToEntity(pDto)); // Cas rare
				propertyMapper.updateFromDto(pDto, property);
			} else {
				property = propertyMapper.convertToEntity(pDto);
                property.setDossier(dossier);
                dossier.getProperties().add(property);
			}
            property.syncRangsFromDto(pDto.getRangs());
            fillPropertyPool(property, pDto, pool);
		}
	}

	private void syncBeneficiaries(List<BeneficiaryDto> dtos, DossierData dossier, Map<String, Property> pool) {
		if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());

		Map<Long, BeneficiaryDto> dtoMap = dtos.stream()
				.filter(p -> p.getId() != null)
				.collect(Collectors.toMap(BeneficiaryDto::getId, p -> p));

		dossier.getBeneficiaries().removeIf(p -> p.getId() != null && !dtoMap.containsKey(p.getId()));

		dossier.getBeneficiaries().forEach(benef -> {
			if(dtoMap.containsKey(benef.getId())){
				BeneficiaryDto bDto = dtoMap.get(benef.getId());
				beneficiaryMapper.updateFromDto(bDto, benef);
				benef.syncProperties(bDto.getProperties(), pool);
			}
		});

		for (BeneficiaryDto bDto : dtos) {
			if (bDto.getId() == null) {
				boolean alreadyExists = dossier.getBeneficiaries().stream()
						.anyMatch(b -> b.getId() == null && bDto.getUuid() != null && bDto.getUuid().equals(b.getUuid()));

				if (!alreadyExists) {
					Beneficiary beneficiary = beneficiaryMapper.convertToEntity(bDto);
					beneficiary.syncProperties(bDto.getProperties(), pool);
					beneficiary.setDossier(dossier);
					dossier.getBeneficiaries().add(beneficiary);
				}
			}
		}
	}


	private void fillPropertyPool(Property p, PropertyDto dto, Map<String, Property> pool) {
		if (dto == null) return;
		String key = (dto.getId() != null ? dto.getId().toString() : (dto.getUuid() != null ? dto.getUuid() : null));
		if (key != null) pool.put(key, p);
	}

	private void initializeCollections(DossierData dossier) {
		if (dossier.getBeneficiaries() == null) dossier.setBeneficiaries(new ArrayList<>());
		if (dossier.getProperties() == null) dossier.setProperties(new ArrayList<>());
	}
