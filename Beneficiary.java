package ma.sg.its.octroicreditcore.model;

import jakarta.persistence.*;
import lombok.*;
import ma.sg.its.octroicreditcore.dto.BeneficiaryDto;
import ma.sg.its.octroicreditcore.dto.PropertyDto;
import ma.sg.its.octroicreditcore.dto.RangDto;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Entity
@Table(name = "beneficiary")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Beneficiary extends BaseEntity {

    @ManyToMany
    @JoinTable(
        name = "beneficiary_property",
        joinColumns = @JoinColumn(name = "beneficiary_id"),
        inverseJoinColumns = @JoinColumn(name = "property_id")
    )
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
     * Les rangs de ce bénéficiaire — owner side.
     * orphanRemoval = true : si rang retiré de la liste → supprimé en DB.
     */
    @OneToMany(mappedBy = "beneficiary", cascade = CascadeType.ALL, fetch = FetchType.LAZY, orphanRemoval = true)
    private List<Rang> rangs = new ArrayList<>();

    // ─── Sync Properties ──────────────────────────────────────────────────────

    public void syncProperties(List<PropertyDto> propertyDtos, Map<String, Property> pool) {
        if (this.properties == null) this.properties = new ArrayList<>();
        this.properties.clear();

        if (propertyDtos != null) {
            for (PropertyDto pd : propertyDtos) {
                String key = pd.getId() != null
                        ? pd.getId().toString()
                        : (pd.getUuid() != null ? pd.getUuid() : null);
                Property pFromPool = pool.get(key);
                if (pFromPool != null) this.properties.add(pFromPool);
            }
        }
    }

    // ─── Sync Rangs ───────────────────────────────────────────────────────────

    /**
     * Synchronise les rangs de ce bénéficiaire à partir d'une liste plate de RangDto.
     *
     * Chaque RangDto référence sa property via propertyId ou propertyUuid.
     * La property doit être dans this.properties — validé ici.
     *
     * 3 cas :
     *  - Rang existant + présent dans DTO  → update
     *  - Rang existant + absent du DTO     → supprimé (orphanRemoval)
     *  - Rang nouveau (id == null)         → création
     *
     * @param rangDtos  liste plate des rangs envoyés par le frontend
     * @param pool      map id/uuid → Property (toutes les properties du dossier)
     */
    public void syncRangs(List<RangDto> rangDtos, Map<String, Property> pool) {
        if (rangDtos == null) rangDtos = new ArrayList<>();

        // IDs des property autorisées pour ce benef
        Set<Long> allowedPropertyIds = this.properties == null
                ? Collections.emptySet()
                : this.properties.stream()
                        .map(Property::getId)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet());

        // Map des rangs modifiés (id != null)
        Map<Long, RangDto> modifiedMap = rangDtos.stream()
                .filter(r -> r.getId() != null)
                .collect(Collectors.toMap(RangDto::getId, r -> r));

        // Supprime les rangs absents du DTO
        this.rangs.removeIf(r -> r.getId() != null && !modifiedMap.containsKey(r.getId()));

        // Update les rangs existants
        for (Rang r : this.rangs) {
            RangDto dto = modifiedMap.get(r.getId());
            if (dto != null) {
                r.setRang(dto.getRang());
                r.setWarrantyAmount(dto.getWarrantyAmount());
            }
        }

        // Crée les nouveaux rangs (id == null)
        for (RangDto dto : rangDtos) {
            if (dto.getId() != null) continue;

            // Résolution de la property via propertyId ou propertyUuid
            String key = dto.getPropertyId() != null
                    ? dto.getPropertyId().toString()
                    : dto.getPropertyUuid();

            if (key == null) continue;

            Property property = pool.get(key);
            if (property == null) continue;

            // Validation métier — la property doit appartenir à ce benef
            if (property.getId() != null && !allowedPropertyIds.contains(property.getId())) {
                throw new IllegalArgumentException(
                    "Property key=" + key + " n'appartient pas à ce bénéficiaire."
                );
            }

            Rang newRang = Rang.builder()
                    .rang(dto.getRang())
                    .warrantyAmount(dto.getWarrantyAmount())
                    .property(property)
                    .beneficiary(this)
                    .build();

            this.rangs.add(newRang);
        }
    }

    // ─── equals / hashCode ────────────────────────────────────────────────────

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Beneficiary other = (Beneficiary) o;
        if (this.getId() != null && other.getId() != null) return this.getId().equals(other.getId());
        if (this.getUuid() != null && other.getUuid() != null) return this.getUuid().equalsIgnoreCase(other.getUuid());
        return false;
    }

    @Override
    public int hashCode() {
        if (getId() != null) return getId().hashCode();
        if (getUuid() != null) return getUuid().hashCode();
        return 0;
    }
}
