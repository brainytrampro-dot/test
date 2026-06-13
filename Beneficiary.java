static diffObjects(base: any, current: any): any {
    const changes: any = {};
    const excludedKeys = new Set(['id', 'uuid']);

    function compare(a: any, b: any, path: string = '') {
        if (a === '' || a === null || a === undefined) a = null;
        if (b === '' || b === null || b === undefined) b = null;

        if (a === b) return;

        const currentKey = (path.split('.').pop() || '').replace(/\[\d+\]/g, '');
        if (excludedKeys.has(currentKey)) return;

        if (a == null || b == null) {
            changes[path] = { from: a, to: b };
            return;
        }

        if (a instanceof Date || b instanceof Date) {
            const ta = a instanceof Date ? a.getTime() : new Date(a).getTime();
            const tb = b instanceof Date ? b.getTime() : new Date(b).getTime();
            if (ta !== tb) changes[path] = { from: a, to: b };
            return;
        }

        if (Array.isArray(a) || Array.isArray(b)) {
            const arrA = Array.isArray(a) ? a : [];
            const arrB = Array.isArray(b) ? b : [];

            const hasIdentifier = (item: any) => item?.id || item?.uuid;

            if (arrA.some(hasIdentifier) || arrB.some(hasIdentifier)) {
                // Match par id/uuid
                arrA.forEach((itemA, i) => {
                    const itemB = arrB.find(b =>
                        (itemA.uuid && b.uuid === itemA.uuid) ||
                        (itemA.id && b.id === itemA.id)
                    );
                    compare(itemA, itemB ?? null, `${path}[${i}]`);
                });

                // Nouveaux éléments dans arrB sans match dans arrA
                arrB.forEach((itemB, i) => {
                    const exists = arrA.find(a =>
                        (itemB.uuid && a.uuid === itemB.uuid) ||
                        (itemB.id && a.id === itemB.id)
                    );
                    if (!exists) compare(null, itemB, `${path}[${arrA.length + i}]`);
                });
            } else {
                // Pas d'identifiant → comparaison par index
                const maxLength = Math.max(arrA.length, arrB.length);
                for (let i = 0; i < maxLength; i++) {
                    compare(arrA[i], arrB[i], `${path}[${i}]`);
                }
            }
            return;
        }

        if (typeof a === 'object' && typeof b === 'object') {
            Object.keys(a).forEach(key => {
                if (excludedKeys.has(key)) return;
                compare(a[key], b[key], path ? `${path}.${key}` : key);
            });
            return;
        }

        changes[path] = { from: a, to: b };
    }

    compare(base, current);
    return changes;
}


package ma.sg.its.octroicreditcore.strategy;

import ma.sg.its.octroicreditcore.dto.*;
import ma.sg.its.octroicreditcore.mapper.BeneficiaryMapper;
import ma.sg.its.octroicreditcore.mapper.GuarantorMapper;
import ma.sg.its.octroicreditcore.mapper.PropertyMapper;
import ma.sg.its.octroicreditcore.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DossierCreationHelperTest {

    @InjectMocks
    private DossierCreationHelper helper;

    @Mock
    private PropertyMapper propertyMapper;

    @Mock
    private BeneficiaryMapper beneficiaryMapper;

    @Mock
    private GuarantorMapper guarantorMapper;

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private PropertyDto makePropertyDto(Long id, String uuid) {
        PropertyDto dto = new PropertyDto();
        dto.setId(id);
        dto.setUuid(uuid);
        return dto;
    }

    private Property makeProperty(Long id, String uuid) {
        Property p = new Property();
        p.setId(id);
        p.setUuid(uuid);
        return p;
    }

    private BeneficiaryDto makeBeneficiaryDto(Long id, String uuid) {
        BeneficiaryDto dto = new BeneficiaryDto();
        dto.setId(id);
        dto.setUuid(uuid);
        return dto;
    }

    private Beneficiary makeBeneficiary(Long id, String uuid) {
        Beneficiary b = new Beneficiary();
        b.setId(id);
        b.setUuid(uuid);
        b.setRangs(new ArrayList<>());
        return b;
    }

    private GuarantorDto makeGuarantorDto(Long id, String uuid) {
        GuarantorDto dto = new GuarantorDto();
        dto.setId(id);
        dto.setUuid(uuid);
        return dto;
    }

    private Guarantor makeGuarantor(Long id, String uuid) {
        Guarantor g = new Guarantor();
        g.setId(id);
        g.setUuid(uuid);
        return g;
    }

    private DossierData emptyDossier() {
        DossierData d = new DossierData();
        d.setId(1L);
        d.setProperties(new ArrayList<>());
        d.setBeneficiaries(new ArrayList<>());
        d.setGuarantors(new ArrayList<>());
        d.setRepresentatives(new ArrayList<>());
        return d;
    }

    private DossierDataDto emptyDto() {
        DossierDataDto dto = new DossierDataDto();
        dto.setPropertyData(new PropertyDataDto());
        dto.getPropertyData().setProperties(new ArrayList<>());
        dto.setBeneficiaries(new ArrayList<>());
        dto.setGuarantors(new ArrayList<>());
        dto.setRepresentatives(new ArrayList<>());
        return dto;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // syncProperties
    // ════════════════════════════════════════════════════════════════════════════

    @Test
    void syncProperties_nullPropertyData_clearsProperties() {
        DossierData dossier = emptyDossier();
        dossier.getProperties().add(makeProperty(1L, "uuid-1"));
        DossierDataDto dto = new DossierDataDto(); // propertyData = null

        helper.syncProperties(dto, dossier, new HashMap<>());

        assertThat(dossier.getProperties()).isEmpty();
    }

    @Test
    void syncProperties_emptyList_clearsProperties() {
        DossierData dossier = emptyDossier();
        dossier.getProperties().add(makeProperty(1L, "uuid-1"));
        DossierDataDto dto = emptyDto(); // empty list

        helper.syncProperties(dto, dossier, new HashMap<>());

        assertThat(dossier.getProperties()).isEmpty();
    }

    @Test
    void syncProperties_removesPropertyNotInDto_andClearsRangsFromBeneficiaries() {
        DossierData dossier = emptyDossier();
        Property existingProp = makeProperty(10L, "uuid-10");
        dossier.getProperties().add(existingProp);

        // beneficiary has a rang referencing that property
        Beneficiary benef = makeBeneficiary(1L, "b-uuid");
        Rang rang = new Rang();
        rang.setProperty(existingProp);
        benef.getRangs().add(rang);
        dossier.setBeneficiaries(List.of(benef));

        DossierDataDto dto = emptyDto();
        // DTO sends a DIFFERENT property id => existing one should be removed
        PropertyDto newProp = makePropertyDto(99L, "uuid-99");
        Property newPropEntity = makeProperty(99L, "uuid-99");
        dto.getPropertyData().setProperties(List.of(newProp));
        when(propertyMapper.convertToEntity(newProp)).thenReturn(newPropEntity);

        Map<String, Property> pool = new HashMap<>();
        helper.syncProperties(dto, dossier, pool);

        assertThat(dossier.getProperties()).doesNotContain(existingProp);
        assertThat(benef.getRangs()).isEmpty(); // rang removed
        assertThat(dossier.getProperties()).contains(newPropEntity);
    }

    @Test
    void syncProperties_updatesExistingProperty_andRegistersInPool() {
        DossierData dossier = emptyDossier();
        Property existingProp = makeProperty(10L, "uuid-10");
        dossier.getProperties().add(existingProp);

        PropertyDto dto10 = makePropertyDto(10L, "uuid-10");
        DossierDataDto dto = emptyDto();
        dto.getPropertyData().setProperties(List.of(dto10));

        Map<String, Property> pool = new HashMap<>();
        helper.syncProperties(dto, dossier, pool);

        verify(propertyMapper).updateFromDto(dto10, existingProp);
        assertThat(pool).containsKey("10");
        assertThat(pool).containsKey("uuid-10");
        assertThat(pool.get("10")).isSameAs(existingProp);
    }

    @Test
    void syncProperties_newProperty_whenDossierIdNull_setsIdNull() {
        DossierData dossier = new DossierData(); // id = null
        dossier.setProperties(new ArrayList<>());
        dossier.setBeneficiaries(new ArrayList<>());

        PropertyDto pDto = makePropertyDto(5L, "uuid-5");
        DossierDataDto dto = emptyDto();
        dto.getPropertyData().setProperties(List.of(pDto));

        Property created = makeProperty(5L, "uuid-5");
        when(propertyMapper.convertToEntity(pDto)).thenReturn(created);

        Map<String, Property> pool = new HashMap<>();
        helper.syncProperties(dto, dossier, pool);

        assertThat(created.getId()).isNull(); // forced null when dossier.id == null
        assertThat(created.getDossier()).isSameAs(dossier);
        assertThat(dossier.getProperties()).contains(created);
        assertThat(pool).containsKey("uuid-5");
    }

    @Test
    void syncProperties_newProperty_whenDossierIdNotNull_addsToCollectionAndPool() {
        DossierData dossier = emptyDossier(); // id = 1L
        // No existing properties with matching id => triggers new branch (id == null check fails but existing doesn't match)
        PropertyDto pDto = makePropertyDto(null, "uuid-new"); // id null => always new
        DossierDataDto dto = emptyDto();
        dto.getPropertyData().setProperties(List.of(pDto));

        Property created = makeProperty(null, "uuid-new");
        when(propertyMapper.convertToEntity(pDto)).thenReturn(created);

        Map<String, Property> pool = new HashMap<>();
        helper.syncProperties(dto, dossier, pool);

        assertThat(dossier.getProperties()).contains(created);
        assertThat(pool).containsKey("uuid-new");
    }

    @Test
    void syncProperties_propertiesNullOnDossier_initializesCollection() {
        DossierData dossier = new DossierData();
        dossier.setProperties(null);
        dossier.setBeneficiaries(new ArrayList<>());
        dossier.setId(1L);

        DossierDataDto dto = emptyDto(); // empty => should clear

        helper.syncProperties(dto, dossier, new HashMap<>());

        assertThat(dossier.getProperties()).isNotNull().isEmpty();
    }

    // ════════════════════════════════════════════════════════════════════════════
    // syncBeneficiaries
    // ════════════════════════════════════════════════════════════════════════════

    @Test
    void syncBeneficiaries_emptyDto_clearsBeneficiaries() {
        DossierData dossier = emptyDossier();
        dossier.getBeneficiaries().add(makeBeneficiary(1L, "b1"));
        DossierDataDto dto = emptyDto();

        helper.syncBeneficiaries(dto, dossier, new HashMap<>(), new HashMap<>());

        assertThat(dossier.getBeneficiaries()).isEmpty();
    }

    @Test
    void syncBeneficiaries_removedBeneficiary_clearsRangsFirst() {
        DossierData dossier = emptyDossier();
        Beneficiary toRemove = makeBeneficiary(99L, "b99");
        Rang rang = new Rang();
        toRemove.getRangs().add(rang);
        dossier.setBeneficiaries(new ArrayList<>(List.of(toRemove)));

        DossierDataDto dto = emptyDto();
        BeneficiaryDto bDto = makeBeneficiaryDto(1L, "b1"); // different id
        dto.setBeneficiaries(List.of(bDto));

        Beneficiary newBenef = makeBeneficiary(null, "b1");
        when(beneficiaryMapper.convertToEntity(bDto)).thenReturn(newBenef);

        helper.syncBeneficiaries(dto, dossier, new HashMap<>(), new HashMap<>());

        assertThat(toRemove.getRangs()).isEmpty();
        assertThat(dossier.getBeneficiaries()).doesNotContain(toRemove);
    }

    @Test
    void syncBeneficiaries_updatesExistingBeneficiary_andRegistersInPool() {
        DossierData dossier = emptyDossier();
        Beneficiary existing = makeBeneficiary(5L, "b5");
        dossier.setBeneficiaries(new ArrayList<>(List.of(existing)));

        BeneficiaryDto bDto = makeBeneficiaryDto(5L, "b5");
        bDto.setProperties(new ArrayList<>());
        bDto.setRangs(new ArrayList<>());
        DossierDataDto dto = emptyDto();
        dto.setBeneficiaries(List.of(bDto));

        Map<String, Beneficiary> benefPool = new HashMap<>();
        helper.syncBeneficiaries(dto, dossier, new HashMap<>(), benefPool);

        verify(beneficiaryMapper).updateFromDto(bDto, existing);
        assertThat(benefPool).containsKey("5");
        assertThat(benefPool).containsKey("b5");
    }

    @Test
    void syncBeneficiaries_newBeneficiary_whenDossierIdNull_setsIdNull() {
        DossierData dossier = new DossierData(); // id null
        dossier.setBeneficiaries(new ArrayList<>());

        BeneficiaryDto bDto = makeBeneficiaryDto(7L, "b7");
        bDto.setProperties(new ArrayList<>());
        bDto.setRangs(new ArrayList<>());
        DossierDataDto dto = emptyDto();
        dto.setBeneficiaries(List.of(bDto));

        Beneficiary created = makeBeneficiary(7L, "b7");
        when(beneficiaryMapper.convertToEntity(bDto)).thenReturn(created);

        Map<String, Beneficiary> pool = new HashMap<>();
        helper.syncBeneficiaries(dto, dossier, new HashMap<>(), pool);

        assertThat(created.getId()).isNull();
        assertThat(pool).containsKey("b7");
    }

    @Test
    void syncBeneficiaries_nullBeneficiariesOnDossier_initializesCollection() {
        DossierData dossier = new DossierData();
        dossier.setBeneficiaries(null);
        DossierDataDto dto = emptyDto();

        helper.syncBeneficiaries(dto, dossier, new HashMap<>(), new HashMap<>());

        assertThat(dossier.getBeneficiaries()).isNotNull().isEmpty();
    }

    // ════════════════════════════════════════════════════════════════════════════
    // syncGuarantors
    // ════════════════════════════════════════════════════════════════════════════

    @Test
    void syncGuarantors_emptyDto_clearsGuarantors() {
        DossierData dossier = emptyDossier();
        dossier.getGuarantors().add(makeGuarantor(1L, "g1"));
        DossierDataDto dto = emptyDto();

        helper.syncGuarantors(dto, dossier, new HashMap<>());

        assertThat(dossier.getGuarantors()).isEmpty();
    }

    @Test
    void syncGuarantors_removesGuarantorNotInDto() {
        DossierData dossier = emptyDossier();
        dossier.getGuarantors().add(makeGuarantor(10L, "g10"));

        GuarantorDto incoming = makeGuarantorDto(99L, "g99"); // different id
        DossierDataDto dto = emptyDto();
        dto.setGuarantors(List.of(incoming));
        Guarantor created = makeGuarantor(null, "g99");
        when(guarantorMapper.convertToEntity(incoming)).thenReturn(created);

        helper.syncGuarantors(dto, dossier, new HashMap<>());

        assertThat(dossier.getGuarantors()).noneMatch(g -> Long.valueOf(10L).equals(g.getId()));
    }

    @Test
    void syncGuarantors_updatesExistingGuarantor_andRegistersInPool() {
        DossierData dossier = emptyDossier();
        Guarantor existing = makeGuarantor(3L, "g3");
        dossier.setGuarantors(new ArrayList<>(List.of(existing)));

        GuarantorDto gDto = makeGuarantorDto(3L, "g3");
        DossierDataDto dto = emptyDto();
        dto.setGuarantors(List.of(gDto));

        Map<String, Guarantor> pool = new HashMap<>();
        helper.syncGuarantors(dto, dossier, pool);

        verify(guarantorMapper).updateFromDto(gDto, existing);
        assertThat(pool).containsKey("3").containsKey("g3");
    }

    @Test
    void syncGuarantors_newGuarantor_whenDossierIdNull_setsIdNull() {
        DossierData dossier = new DossierData(); // id null
        dossier.setGuarantors(new ArrayList<>());

        GuarantorDto gDto = makeGuarantorDto(5L, "g5");
        DossierDataDto dto = emptyDto();
        dto.setGuarantors(List.of(gDto));

        Guarantor created = makeGuarantor(5L, "g5");
        when(guarantorMapper.convertToEntity(gDto)).thenReturn(created);

        Map<String, Guarantor> pool = new HashMap<>();
        helper.syncGuarantors(dto, dossier, pool);

        assertThat(created.getId()).isNull();
        assertThat(pool).containsKey("g5");
    }

    @Test
    void syncGuarantors_nullGuarantorsOnDossier_initializesCollection() {
        DossierData dossier = new DossierData();
        dossier.setGuarantors(null);
        DossierDataDto dto = emptyDto();

        helper.syncGuarantors(dto, dossier, new HashMap<>());

        assertThat(dossier.getGuarantors()).isNotNull().isEmpty();
    }

    // ════════════════════════════════════════════════════════════════════════════
    // syncRepresentatives
    // ════════════════════════════════════════════════════════════════════════════

    @Test
    void syncRepresentatives_emptyDto_clearsRepresentativesAndUnlinks() {
        DossierData dossier = emptyDossier();
        Representative rep = mock(Representative.class);
        dossier.setRepresentatives(new ArrayList<>(List.of(rep)));
        DossierDataDto dto = emptyDto(); // representatives empty

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), new HashMap<>());

        verify(rep).unlinkAllBeneficiaries();
        verify(rep).unlinkAllGuarantors();
        verify(rep).unlinkAllCustomers();
        assertThat(dossier.getRepresentatives()).isEmpty();
    }

    @Test
    void syncRepresentatives_nullRepresentatives_clearsAndUnlinks() {
        DossierData dossier = emptyDossier();
        Representative rep = mock(Representative.class);
        dossier.setRepresentatives(new ArrayList<>(List.of(rep)));

        DossierDataDto dto = new DossierDataDto();
        dto.setRepresentatives(null);

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), new HashMap<>());

        verify(rep).unlinkAllBeneficiaries();
        assertThat(dossier.getRepresentatives()).isEmpty();
    }

    @Test
    void syncRepresentatives_newDossier_createsRepresentativeWithNullId() {
        DossierData dossier = new DossierData(); // id null => new dossier
        dossier.setRepresentatives(new ArrayList<>());
        dossier.setBeneficiaries(new ArrayList<>());
        dossier.setGuarantors(new ArrayList<>());

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setId(1L);
        repDto.setFirstname("Ali");
        repDto.setLastname("Hassan");

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), new HashMap<>());

        assertThat(dossier.getRepresentatives()).hasSize(1);
        Representative created = dossier.getRepresentatives().get(0);
        assertThat(created.getId()).isNull();
        assertThat(created.getFirstname()).isEqualTo("Ali");
        assertThat(created.getLastname()).isEqualTo("Hassan");
    }

    @Test
    void syncRepresentatives_existingDossier_updatesExistingRep_andUnlinksFirst() {
        DossierData dossier = emptyDossier(); // id = 1L

        Representative existingRep = new Representative();
        existingRep.setId(10L);
        existingRep.setBeneficiaryAssociations(new ArrayList<>());
        existingRep.setGuarantorAssociations(new ArrayList<>());
        dossier.setRepresentatives(new ArrayList<>(List.of(existingRep)));

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setId(10L);
        repDto.setFirstname("Updated");

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), new HashMap<>());

        assertThat(existingRep.getFirstname()).isEqualTo("Updated");
        assertThat(dossier.getRepresentatives()).contains(existingRep);
    }

    @Test
    void syncRepresentatives_removesRepNotInIncomingIds() {
        DossierData dossier = emptyDossier();

        Representative toRemove = new Representative();
        toRemove.setId(99L);
        dossier.setRepresentatives(new ArrayList<>(List.of(toRemove)));

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setId(5L); // different
        repDto.setFirstname("New");

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), new HashMap<>());

        assertThat(dossier.getRepresentatives()).noneMatch(r -> Long.valueOf(99L).equals(r.getId()));
    }

    // ─── linkCustomerRelationship ─────────────────────────────────────────────

    @Test
    void syncRepresentatives_linksCustomer_whenCustomerDataPresent() {
        DossierData dossier = new DossierData();
        dossier.setId(null); // new dossier
        dossier.setRepresentatives(new ArrayList<>());
        dossier.setBeneficiaries(new ArrayList<>());
        dossier.setGuarantors(new ArrayList<>());

        Customer customer = new Customer();
        CustomerCard card = new CustomerCard();
        card.setCustomer(customer);
        dossier.setCustomerData(card);

        RepresentativeDtoCustomerRef customerRef = new RepresentativeDtoCustomerRef();
        customerRef.setProxyDate(LocalDate.of(2024, 1, 1));

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setCustomer(customerRef);

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), new HashMap<>());

        Representative created = dossier.getRepresentatives().get(0);
        // linkCustomer should have been called — verify via side effect if Representative is not mocked
        // This confirms no NPE and representative was created
        assertThat(created).isNotNull();
    }

    // ─── linkBeneficiaryRelationships ─────────────────────────────────────────

    @Test
    void syncRepresentatives_linksBeneficiary_viaIdKey() {
        DossierData dossier = emptyDossier();

        Beneficiary benef = makeBeneficiary(7L, "b7");
        dossier.setBeneficiaries(List.of(benef));

        Map<String, Beneficiary> benefPool = new HashMap<>();
        benefPool.put("7", benef);

        BeneficiaryRefDto bRef = new BeneficiaryRefDto();
        BeneficiaryDto bInner = makeBeneficiaryDto(7L, null);
        bRef.setBeneficiary(bInner);
        bRef.setProxyDate(LocalDate.now());

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setId(1L);
        repDto.setBeneficiaries(List.of(bRef));

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), benefPool);

        Representative created = dossier.getRepresentatives().get(0);
        assertThat(created.getBeneficiaryAssociations()).hasSize(1);
        assertThat(created.getBeneficiaryAssociations().get(0).getBeneficiary()).isSameAs(benef);
    }

    @Test
    void syncRepresentatives_linksBeneficiary_viaUuidKey_whenIdNull() {
        DossierData dossier = emptyDossier();

        Beneficiary benef = makeBeneficiary(null, "uuid-benef");
        dossier.setBeneficiaries(List.of(benef));

        Map<String, Beneficiary> benefPool = new HashMap<>();
        benefPool.put("uuid-benef", benef);

        BeneficiaryRefDto bRef = new BeneficiaryRefDto();
        BeneficiaryDto bInner = makeBeneficiaryDto(null, "uuid-benef");
        bRef.setBeneficiary(bInner);

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setBeneficiaries(List.of(bRef));

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), benefPool);

        Representative created = dossier.getRepresentatives().get(0);
        assertThat(created.getBeneficiaryAssociations()).hasSize(1);
    }

    @Test
    void syncRepresentatives_skipsBeneficiaryRef_whenBeneficiaryNotInPool() {
        DossierData dossier = emptyDossier();

        Map<String, Beneficiary> benefPool = new HashMap<>(); // empty pool

        BeneficiaryRefDto bRef = new BeneficiaryRefDto();
        BeneficiaryDto bInner = makeBeneficiaryDto(99L, null);
        bRef.setBeneficiary(bInner);

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setBeneficiaries(List.of(bRef));

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));
        dossier.setBeneficiaries(List.of(makeBeneficiary(1L, "b1"))); // non-empty so early return skipped

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), benefPool);

        Representative created = dossier.getRepresentatives().get(0);
        assertThat(created.getBeneficiaryAssociations()).isEmpty();
    }

    @Test
    void syncRepresentatives_skipsBeneficiaryRef_whenBeneficiaryInnerDtoNull() {
        DossierData dossier = emptyDossier();
        dossier.setBeneficiaries(List.of(makeBeneficiary(1L, "b1")));

        BeneficiaryRefDto bRef = new BeneficiaryRefDto();
        bRef.setBeneficiary(null); // null inner dto

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setBeneficiaries(List.of(bRef));

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), new HashMap<>());

        Representative created = dossier.getRepresentatives().get(0);
        assertThat(created.getBeneficiaryAssociations()).isEmpty();
    }

    // ─── linkGuarantorRelationships ───────────────────────────────────────────

    @Test
    void syncRepresentatives_linksGuarantor_viaIdKey() {
        DossierData dossier = emptyDossier();

        Guarantor guarantor = makeGuarantor(8L, "g8");
        dossier.setGuarantors(List.of(guarantor));

        Map<String, Guarantor> guarantorPool = new HashMap<>();
        guarantorPool.put("8", guarantor);

        GuarantorRefDto gRef = new GuarantorRefDto();
        GuarantorDto gInner = makeGuarantorDto(8L, null);
        gRef.setGuarantor(gInner);
        gRef.setProxyDate(LocalDate.now());

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setGuarantors(List.of(gRef));

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, guarantorPool, new HashMap<>());

        Representative created = dossier.getRepresentatives().get(0);
        assertThat(created.getGuarantorAssociations()).hasSize(1);
        assertThat(created.getGuarantorAssociations().get(0).getGuarantor()).isSameAs(guarantor);
    }

    @Test
    void syncRepresentatives_linksGuarantor_viaUuidKey_whenIdNull() {
        DossierData dossier = emptyDossier();

        Guarantor guarantor = makeGuarantor(null, "uuid-g");
        dossier.setGuarantors(List.of(guarantor));

        Map<String, Guarantor> guarantorPool = new HashMap<>();
        guarantorPool.put("uuid-g", guarantor);

        GuarantorRefDto gRef = new GuarantorRefDto();
        GuarantorDto gInner = makeGuarantorDto(null, "uuid-g");
        gRef.setGuarantor(gInner);

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setGuarantors(List.of(gRef));

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, guarantorPool, new HashMap<>());

        Representative created = dossier.getRepresentatives().get(0);
        assertThat(created.getGuarantorAssociations()).hasSize(1);
    }

    @Test
    void syncRepresentatives_skipsGuarantorRef_whenNotInPool() {
        DossierData dossier = emptyDossier();
        dossier.setGuarantors(List.of(makeGuarantor(1L, "g1"))); // non-empty to bypass early return

        Map<String, Guarantor> guarantorPool = new HashMap<>(); // empty

        GuarantorRefDto gRef = new GuarantorRefDto();
        gRef.setGuarantor(makeGuarantorDto(99L, null));

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setGuarantors(List.of(gRef));

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, guarantorPool, new HashMap<>());

        Representative created = dossier.getRepresentatives().get(0);
        assertThat(created.getGuarantorAssociations()).isEmpty();
    }

    @Test
    void syncRepresentatives_skipsGuarantorRef_whenGuarantorInnerDtoNull() {
        DossierData dossier = emptyDossier();
        dossier.setGuarantors(List.of(makeGuarantor(1L, "g1")));

        GuarantorRefDto gRef = new GuarantorRefDto();
        gRef.setGuarantor(null); // null

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setGuarantors(List.of(gRef));

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        helper.syncRepresentatives(dto, dossier, new HashMap<>(), new HashMap<>());

        Representative created = dossier.getRepresentatives().get(0);
        assertThat(created.getGuarantorAssociations()).isEmpty();
    }

    // ─── Edge cases ───────────────────────────────────────────────────────────

    @Test
    void syncRepresentatives_multipleCalls_clearsOldAssociationsEachTime() {
        DossierData dossier = emptyDossier();

        Beneficiary benef = makeBeneficiary(3L, "b3");
        dossier.setBeneficiaries(List.of(benef));
        Map<String, Beneficiary> benefPool = Map.of("3", benef);

        Representative existingRep = new Representative();
        existingRep.setId(1L);
        existingRep.setBeneficiaryAssociations(new ArrayList<>());
        existingRep.setGuarantorAssociations(new ArrayList<>());
        dossier.setRepresentatives(new ArrayList<>(List.of(existingRep)));

        BeneficiaryRefDto bRef = new BeneficiaryRefDto();
        bRef.setBeneficiary(makeBeneficiaryDto(3L, null));

        RepresentativeDto repDto = new RepresentativeDto();
        repDto.setId(1L);
        repDto.setBeneficiaries(List.of(bRef));

        DossierDataDto dto = emptyDto();
        dto.setRepresentatives(List.of(repDto));

        // First sync
        helper.syncRepresentatives(dto, dossier, new HashMap<>(), benefPool);
        assertThat(existingRep.getBeneficiaryAssociations()).hasSize(1);

        // Second sync — associations should be replaced, not accumulated
        helper.syncRepresentatives(dto, dossier, new HashMap<>(), benefPool);
        assertThat(existingRep.getBeneficiaryAssociations()).hasSize(1);
    }
}
