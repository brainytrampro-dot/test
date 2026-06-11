package ma.sg.its.octroicreditcore.service;

import jakarta.persistence.EntityManager;
import ma.sg.its.octroicreditcore.Specification.DossierKpiSpecification;
import ma.sg.its.octroicreditcore.constant.ErrorsConstants;
import ma.sg.its.octroicreditcore.dto.*;
import ma.sg.its.octroicreditcore.enumeration.DossierListEnum;
import ma.sg.its.octroicreditcore.enumeration.DossierStatus;
import ma.sg.its.octroicreditcore.exception.NotFoundException;
import ma.sg.its.octroicreditcore.exception.TechnicalException;
import ma.sg.its.octroicreditcore.mapper.*;
import ma.sg.its.octroicreditcore.mapper.kpi.KpiDataMapper;
import ma.sg.its.octroicreditcore.mapper.kpi.KpiDataMapperImpl;
import ma.sg.its.octroicreditcore.model.*;
import ma.sg.its.octroicreditcore.repository.*;
import ma.sg.its.octroicreditcore.strategy.DossierCreation;
import ma.sg.its.octroicreditcore.strategy.DossierCreationContext;
import ma.sg.its.octroicreditcore.strategy.DossierCreationProspectService;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mapstruct.factory.Mappers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static java.math.BigDecimal.valueOf;
import static java.util.Collections.singletonList;
import static org.assertj.core.api.AssertionsForClassTypes.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.*;

@ExtendWith(SpringExtension.class)
@ActiveProfiles("test")
class DossierDataServiceTest {

	@TestConfiguration
	static class DossierDataServiceTestContextConfiguration {
		@Bean
		public DossierDataService dossierDataService() {
			return new DossierDataService();
		}

		@Bean
		public CustomerMapper customerMapper(){ return new CustomerMapperImpl();}
		@Bean
		public DossierDataMapper dossierDataMapper() {return new DossierDataMapperImpl();}
		@Bean
		public DossierUserMapper dossierUserMapper() {return new DossierUserMapperImpl();}
		@Bean
		public UserMapper userMapper() {return new UserMapperImpl();}
		@Bean
		public GuarantorMapper guarantorMapper() {return new GuarantorMapperImpl();}
		@Bean
		public CommentMapper commentMapper() { return new CommentMapperImpl();}
		@Bean
		public DebtMapper debtMapper() { return new DebtMapperImpl(); }
		@Bean
		ReassignmentRequestMapper ReassignmentRequestMapper(){return new ReassignmentRequestMapperImpl();}
		@Bean
		DebtInfonMapper debtInfonMapper() {return new DebtInfonMapperImpl();}
		@Bean
		KpiDataMapper kpiDataMapper() {return new KpiDataMapperImpl();}
		@Bean
		AttachmentMapper attachmentMapper() {return new AttachmentMapperImpl();}
		@Bean
		InterventionMapper interventionMapper() {return new InterventionMapperImpl();}
		@Bean
		AttachmentControlMapper attachmentControlMapper() {return new AttachmentControlMapperImpl();}

		@Bean
		RequestWarrantyMapper requestWarrantyMapper() {return new RequestWarrantyMapperImpl();}

		@Bean
		RestrictionMapper restrictionMapper() {return new RestrictionMapperImpl();}
		@Bean
		DossierAttachmentTypeMapper dossierAttachmentTypeMapper() {return new DossierAttachmentTypeMapperImpl();}

		@Bean
		AmortizableLoanMapper amortizableLoanMapper() {return new AmortizableLoanMapperImpl();}
		@Bean
		BeneficiaryMapper beneficiaryMapper() {return new BeneficiaryMapperImpl();}
		@Bean
		PropertyMapper propertyMapper() {return new PropertyMapperImpl();}
        @Bean
        RepresentativeMapper representativeMapper() {return new RepresentativeMapperImpl();}

        @Bean
        public RepresentativeBeneficiaryMapper representativeBeneficiaryMapper() {
            return new RepresentativeBeneficiaryMapperImpl();
        }

        @Bean
        public RepresentativeGuarantorMapper representativeGuarantorMapper() {
            return new RepresentativeGuarantorMapperImpl();
        }

        @Bean
        public RepresentativeCustomerMapper representativeCustomerMapper() {
            return new RepresentativeCustomerMapperImpl();
        }
	}

	@MockitoBean
	DossierDataRepository dossierDataRepository;

	@MockitoBean
	GuarantorRepository guarantorRepository;
	@MockitoBean
	private DossierCreationContext dossierCreationContext;

	@MockitoBean
	private DossierCreation dossierCreationStrategy;
	@MockitoBean
	AttachmentRepository attachmentRepository;
	@MockitoBean
	private BeneficiaryRepository beneficiaryRepository;
	@MockitoBean
	private CustomerCardRepository customerCardRepository;
	@MockitoBean
	private CustomerRepository customerRepository;
	@MockitoBean
	private UserRepository userRepository;
	@MockitoBean
	private DossierUserRepository dossierUserRepository;
	@MockitoBean
	private DossierAttachmentTypeService dossierAttachmentTypeService;
	@MockitoBean
	private EntityManager entityManager;
	@Autowired
	GuarantorMapper guarantorMapper;
	@MockitoBean
	DebtRepository debtRepository;
	@MockitoBean
	private DebtService debtService;
	@Autowired
	DossierDataMapper dossierDataMapper;
	@Autowired
	DossierUserMapper dossierUserMapper;
	@Autowired
	private CustomerMapper customerMapper;

	@Autowired
	private PropertyMapper propertyMapper;
	@Autowired
	private BeneficiaryMapper beneficiaryMapper;
	@Autowired
	private DossierAttachmentTypeMapper dossierAttachmentTypeMapper;
	@MockitoBean
	UserService userService;
	@Autowired
	private UserMapper userMapper;
	@Autowired
	private DossierDataService dossierDataService;
	@MockitoBean
	DossierRequestRepository dossierRequestRepository;
	@MockitoBean
	DossierReturnDecisionService dossierReturnDecisionService;
	@MockitoBean
	ReassignmentRequestRepository reassignmentRequestRepository;
	@MockitoBean
	DebtInfonRepository debtInfonRepository;

	@Autowired
	DebtInfonMapper debtInfonMapper;
	@Autowired
	private KpiDataMapper kpiDataMapper;

	@Autowired
	private RestrictionMapper restrictionMapper;

	@Autowired
	private RequestWarrantyMapper requestWarrantyMapper;

	@MockitoBean
	private DossierKpiSpecification<DossierKpiView> dossierKpiSpecification;

	@MockitoBean
	private TaskService taskService;
    @MockitoBean
    private TaskRepository taskRepository;

	@MockitoBean
	private AmortizableLoanRepository amortizableLoanRepository;

	@Autowired
	private AmortizableLoanMapper amortizableLoanMapper;

	@MockitoBean
	private DossierRequestService dossierRequestService;
    @Autowired
    private RepresentativeMapper representativeMapper;
	@Test
	void givenDossierDataObject_whenCreate_thenReturnSavedDossierData() {
		DossierCreationProspectService serviceMock = mock(DossierCreationProspectService.class);
		DossierDataDto expected = mock(DossierDataDto.class);

		when(dossierCreationContext.resolve(any())).thenReturn(serviceMock);
		when(serviceMock.create(any())).thenReturn(expected);

		DossierDataDto actual = dossierDataService.create(DossierDataDto.builder().build());

		assertEquals(expected, actual);
	}



    private static DossierData prepareDossierData(LoanData loanData, Boolean isDebtExtern, Boolean isDebtInfo){
        DossierData oldDossier = DossierData.builder().build();
        oldDossier.setId(1L);
        oldDossier.setUuid("uuid");

        Guarantor guarantor = Guarantor.builder()
                .firstName("first1")
                .lastName("last1")
                .address("casablanca")
                .idCardNumber("RE9666")
                .issuedAt(LocalDate.now())
                .build();
        guarantor.setId(200L);

        Beneficiary beneficiary = Beneficiary.builder()
                .firstname("first1")
                .lastname("last1")
                .address("casablanca")
                .idCardNumber("RE9666")
                .issuedAt(LocalDate.now())
                .build();
        beneficiary.setId(100L);

        Representative representative = Representative.builder()
                .firstname("John")
                .lastname("Doe")
                .cin("CIN123")
                .cinIssuedAt(LocalDate.now())
                .build();
        representative.setId(50L);
        representative.setBeneficiaryAssociations(new ArrayList<>());
        representative.setGuarantorAssociations(new ArrayList<>());
        representative.setCustomerAssociations(new ArrayList<>());

		if(loanData != null) {
			loanData.setIsExternDebtsRetrieved(isDebtExtern);
			loanData.setIsExternDebtsInfnRetrieved(isDebtInfo);
			Debt debt = Debt.builder().establishmentCode("021").amendmentNumber(10001).remainingCapital(valueOf(12000)).applicantType(01).fileNumber("15444").build();
			DebtInfon debtInfoNeg = DebtInfon.builder().establishment("021").infomationType("info").observationDate(LocalDate.now()).amount(BigDecimal.ONE).build();
			List<Debt> debts = new ArrayList<>();
			debts.add(debt);
			List<DebtInfon> DebtsInfon = new ArrayList<>();
			DebtsInfon.add(debtInfoNeg);
			oldDossier.setDebts(debts);
			oldDossier.setDebtsinfon(DebtsInfon);
		}

		DossierAttachmentTypePK dossierAttachmentTypePK = new DossierAttachmentTypePK();
		dossierAttachmentTypePK.setCodeRefAttachmentType("code");
		Attachment attachment =Attachment.builder().dossierAttachmentType(DossierAttachmentType.builder().dossier(oldDossier).uuid("uuid").id(dossierAttachmentTypePK).build()).build();
		attachment.setUuid(UUID.randomUUID().toString());

		List<Warranty> warranties = new ArrayList<>();
		warranties.add(Warranty.builder().type(WarrantyType.PROPOSED).content("Warr001").attachment(attachment).build());

		List<Restriction> restrictions = new ArrayList<>();
		restrictions.add(Restriction.builder().content("Rest001").type(RestrictionType.DSC).build());
		restrictions.add(Restriction.builder().content("Rest002").type(RestrictionType.OBSERVATION).build());
		restrictions.add(Restriction.builder().content("Rest003").type(RestrictionType.FRONT).build());
		List<Rang> rangs = new ArrayList<>();
		Rang rang = new Rang(1L, 12, BigDecimal.valueOf(1000), new Property(), new Beneficiary());
		rangs.add(rang);
		Property original = Property.builder()
				.id(1L)
				.landCertificateNumber("OLD-LCN")
				.propertyArea("100.0")
				.codePropertyCity("OLD")
				.forAcquisition(false)
				.rangs(rangs)
				.immoProgramName("OLD")
				.reference("OLD-REF")
				.cpvDate(LocalDate.of(2020, 1, 1))
				.companyName("OLD")
				.capital("OLD-CAPITAL")
				.companyAddress("OLD-ADDRESS")
				.registerNumber("OLD-REG")
				.purchaseProof("OLD-PROOF")
				.deposit("OLD")
				.page("OLD")
				.date(LocalDate.of(2020, 2, 2))
				.exactAdress("OLD")
				.areaDelimitation("OLD")
				.inVsbProgram(false)
				.build();

		oldDossier.setId(1L);
		oldDossier.setUuid("uuid");
		oldDossier.setProperties(List.of(original));
		oldDossier.setComments(Collections.emptyList());
		oldDossier.setWarranties(warranties);
		oldDossier.setRestrictions(restrictions);
		oldDossier.setGuarantors(List.of(guarantor));
		oldDossier.setBeneficiaries(List.of(beneficiary));
		oldDossier.setLoanData(loanData);
		oldDossier.setCustomerData(CustomerCard.builder().customer(Customer.builder().prospect(true).build()).build());
        oldDossier.setRepresentatives(List.of(representative));

		return oldDossier;
	}

	static Stream<Arguments> provideDossierForUpdate(){
		return Stream.of(
			Arguments.of(prepareDossierData(LoanData.builder().build(), false, false), DossierStatus.INIT.toString()),
			Arguments.of(prepareDossierData(null, null, null), null),
			Arguments.of(prepareDossierData(null, null, null), DossierStatus.DESC_RS.toString()),
			Arguments.of(prepareDossierData(LoanData.builder().build(), false, false), DossierStatus.DECS.toString())
		);
	}

    @ParameterizedTest
    @MethodSource("provideDossierForUpdate")
    void givenDossierDataObject_whenUpdate_thenReturnSavedDossierData(DossierData dossier, String status) throws TechnicalException {
        User user = new User();
        user.setId(1L);
        if (dossier.getProperties() == null) {
            dossier.setProperties(new ArrayList<>());
        } else if (!(dossier.getProperties() instanceof ArrayList)) {
            dossier.setProperties(new ArrayList<>(dossier.getProperties()));
        }
        if (dossier.getRepresentatives() == null) {
            dossier.setRepresentatives(new ArrayList<>());
        } else {
            dossier.setRepresentatives(new ArrayList<>(dossier.getRepresentatives()));
        }
        dossier.setStatus(status);

        Guarantor existingGUpdate = new Guarantor();
        existingGUpdate.setId(10L);
        existingGUpdate.setFirstName("Old");
        existingGUpdate.setIdCardNumber("CIN-G-10");

        Guarantor existingGRemove = new Guarantor();
        existingGRemove.setId(20L);
        existingGRemove.setFirstName("Remove");

        dossier.setGuarantors(new ArrayList<>(List.of(existingGUpdate, existingGRemove)));

        Beneficiary existingBFallback = new Beneficiary();
        existingBFallback.setId(99L);
        existingBFallback.setIdCardNumber("CIN-B-99");
        dossier.setBeneficiaries(new ArrayList<>(List.of(existingBFallback)));

        Representative setupRep = new Representative();
        setupRep.setId(88L);
        dossier.setRepresentatives(new ArrayList<>(List.of(setupRep)));

        DossierDataDto dossierDto = dossierDataMapper.convertToDTO(dossier);
        dossierDto.setDossierUsers(Collections.singleton(DossierUserDto.builder()
                .user(UserDto.builder().matricule("mat").build())
                .codeRole("INITIATOR")
                .codeProfession("CCP")
                .build()));

        GuarantorDto guarDtoUpdate = GuarantorDto.builder().id(10L).firstName("New").idCardNumber("CIN-G-10").build();
        GuarantorDto guarDtoNew = GuarantorDto.builder().id(null).idCardNumber("CIN-G-NEW").build();
        dossierDto.setGuarantors(List.of(guarDtoUpdate, guarDtoNew));

        RepresentativeDto repDto = RepresentativeDto.builder().id(1L)
//                .beneficiaries(List.of(Represen.builder().id(null).idCardNtativeumber("CIN-B-99").build()))
//                .guarantors(List.of(GuarantorDto.builder().idCardNumber("CIN-G-10").build()))
                .build();
        dossierDto.setRepresentatives(List.of(repDto));

        given(dossierDataRepository.findByUuid(any(String.class))).willReturn(dossier);
        when(userService.getUserBy(anyString())).thenReturn(user);
        when(dossierUserRepository.findByIdDossierIdAndIdUserIdAndIdCodeRole(dossier.getId(), user.getId(), "INITIATOR"))
                .thenReturn(Optional.empty());
        when(customerCardRepository.save(any(CustomerCard.class))).thenReturn(CustomerCard.builder().build());

        when(dossierDataRepository.save(any(DossierData.class))).thenReturn(dossier);

        when(dossierCreationContext.resolve(dossierDto)).thenReturn(dossierCreationStrategy);
        when(dossierCreationStrategy.create(dossierDto)).thenReturn(dossierDto);

        DossierDataDto savedDossierData = dossierDataService.update(dossierDto);

        assertNotNull(savedDossierData);
        verify(dossierUserRepository, times(1)).save(any(DossierUser.class));
    }

	@ParameterizedTest
	@MethodSource("provideDossierForUpdate")
	void givenDossierDataObject_whenUpdateProperty_thenReturnSavedDossierData(DossierData dossier, String status) throws TechnicalException {
		User user = new User();
		user.setId(1L);
		Property original = Property.builder()
				.id(1L)
				.landCertificateNumber("OLD-LCN")
				.propertyArea("100.0")
				.codePropertyCity("OLD-CITY")
				.forAcquisition(false)
				.rangs(new ArrayList<>(List.of(new Rang(1L, 1, BigDecimal.valueOf(1000), new Property(), new Beneficiary()))))
				.immoProgramName("OLD-PROGRAM")
				.reference("OLD-REF")
				.cpvDate(LocalDate.of(2020, 1, 1))
				.companyName("OLD-COMPANY")
				.capital("OLD-CAPITAL")
				.companyAddress("OLD-ADDRESS")
				.registerNumber("OLD-REG")
				.purchaseProof("OLD-PROOF")
				.deposit("OLD-DEPOSIT")
				.page("OLD-PAGE")
				.date(LocalDate.of(2020, 2, 2))
				.exactAdress("OLD-EXACT")
				.areaDelimitation("OLD-AREA")
				.inVsbProgram(false)
				.build();

		dossier.setProperties(new ArrayList<>(List.of(original)));
        dossier.setCoFinancing(true);
        dossier.setRepresentatives(new ArrayList<>());
		dossier.setStatus(status);
        dossier.setBeneficiaries(new ArrayList<>());
        dossier.setGuarantors(new ArrayList<>());

        RepresentativeDto repDto = RepresentativeDto.builder()
                .id(null)
                .firstname("Rep")
                .lastname("Name")
                .cin("REP123")
//                .beneficiaries(List.of(BeneficiaryDto.builder().id(20L).idCardNumber("BEN123").build()))
//                .guarantors(List.of(GuarantorDto.builder().id(30L).idCardNumber("GAR123").build()))
                .build();
		DossierDataDto dossierDto = dossierDataMapper.convertToDTO(dossier);
		PropertyDto expected = dossierDto.getPropertyData().getProperties().get(0);
		Property actual = dossier.getProperties().get(0);
		assertEquals(expected.getLandCertificateNumber(), actual.getLandCertificateNumber());
		assertEquals(expected.getPropertyArea(), actual.getPropertyArea());
		assertEquals(expected.getCodePropertyCity(), actual.getCodePropertyCity());
		assertEquals(expected.getCompanyName(),actual.getCompanyName());
		dossierDto.setDossierUsers(Collections.singleton(DossierUserDto.builder()
				.user(UserDto.builder().matricule("mat").build())
				.codeRole("INITIATOR")
				.codeProfession("CCP")
				.build()));
        dossierDto.setRepresentatives(List.of(repDto));


		given(dossierDataRepository.findByUuid(any(String.class))).willReturn(dossier);
		when(userService.getUserBy(anyString())).thenReturn(user);
		when(dossierUserRepository.findByIdDossierIdAndIdUserIdAndIdCodeRole(dossier.getId(), user.getId(), "INITIATOR"))
				.thenReturn(Optional.empty());
		when(customerCardRepository.save(any(CustomerCard.class))).thenReturn(CustomerCard.builder().build());
		when(customerRepository.findByCode(anyString())).thenReturn(Customer.builder().build());

		when(dossierDataRepository.save(any(DossierData.class))).thenReturn(dossier);


		when(dossierCreationContext.resolve(dossierDto)).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(dossierDto)).thenReturn(dossierDto);

		DossierDataDto savedDossierData = dossierDataService.update(dossierDto);
        assertEquals(1, dossier.getRepresentatives().size());
        assertNotNull(savedDossierData);
		PropertyDto updateProperty = PropertyDto.builder()
				.id(1L)
				.landCertificateNumber("LCN")
				.propertyArea("100.0")
				.codePropertyCity("CITY")
				.forAcquisition(false)
				.rangs(Arrays.asList(new RangDto(1L, 3, BigDecimal.valueOf(1000), null, null)))
				.immoProgramName("OLD-PROGRAM")
				.reference("OLD-REF")
				.cpvDate(LocalDate.of(2020, 1, 1))
				.companyName("OLD-COMPANY")
				.capital("OLD-CAPITAL")
				.companyAddress("OLD-ADDRESS")
				.registerNumber("REG")
				.purchaseProof("PROOF")
				.deposit("OLD-DEPOSIT")
				.page("OLD-PAGE")
				.date(LocalDate.of(2020, 2, 2))
				.exactAdress("EXACT")
				.areaDelimitation("AREA")
				.inVsbProgram(false)
				.build();
		PropertyDataDto updatePropertyDataDto = PropertyDataDto.builder()
				.properties(List.of(updateProperty))
				.coFinancing(true)
				.build();
		savedDossierData.setPropertyData(updatePropertyDataDto);
		CustomerDto customerDto = CustomerDto.builder()
				.prospect(false)
				.build();
		CustomerCardDto customerCardDto = CustomerCardDto.builder()
				.customer(customerDto)
				.build();
		savedDossierData.setCustomerData(customerCardDto);
		DossierDataDto savedDossierDataProperty = dossierDataService.update(savedDossierData);
		assertNotNull(savedDossierDataProperty);
		assertEquals("LCN", savedDossierDataProperty.getPropertyData().getProperties().get(0).getLandCertificateNumber());
		assertEquals("CITY", savedDossierDataProperty.getPropertyData().getProperties().get(0).getCodePropertyCity());
		verify(dossierUserRepository, times(1)).save(any(DossierUser.class));
	}

    @ParameterizedTest
    @MethodSource("provideDossierForUpdate")
    void givenDossierWithComplexData_whenUpdate_thenSyncAllCorrectly(DossierData dossier, String status) throws TechnicalException {
        User user = new User();
        user.setId(1L);
        dossier.setStatus(status);
        dossier.setId(100L);

        // ============================================
        // SETUP: Initialize all collections
        // ============================================
        if (dossier.getGuarantors() == null) dossier.setGuarantors(new ArrayList<>(List.of()));
        if (dossier.getWarranties() == null) dossier.setWarranties(new ArrayList<>());
        if (dossier.getRestrictions() == null) dossier.setRestrictions(new ArrayList<>());
        if (dossier.getComments() == null) dossier.setComments(new ArrayList<>());
        if (dossier.getDebts() == null) dossier.setDebts(new ArrayList<>());
        if (dossier.getDebtsinfon() == null) dossier.setDebtsinfon(new ArrayList<>());

        // ============================================
        // SETUP: Propriété existante
        // ============================================
        Property existingProp = Property.builder()
                .id(1L)
                .landCertificateNumber("OLD-LCN")
                .rangs(new ArrayList<>())
                .build();

        // ============================================
        // SETUP: Bénéficiaire existant avec rangs
        // ============================================
        Beneficiary existingBenef = Beneficiary.builder()
                .firstname("OLD-FN")
                .properties(new ArrayList<>(List.of(existingProp)))
                .rangs(new ArrayList<>())
                .build();
        existingBenef.setId(50L);
        existingBenef.setUuid("benef-existing-uuid");

        // Ajouter les rangs
        existingBenef.getRangs().add(Rang.builder()
                .id(1L)
                .rang(1)
                .warrantyAmount(BigDecimal.valueOf(1000))
                .property(existingProp)
                .beneficiary(existingBenef)
                .build());
        existingBenef.getRangs().add(Rang.builder()
                .id(2L)
                .rang(9)
                .warrantyAmount(BigDecimal.valueOf(9999))
                .property(existingProp)
                .beneficiary(existingBenef)
                .build());
        Guarantor guarantor= Guarantor.builder()
                .firstName("OLD-GU")
                .build();
        dossier.setProperties(new ArrayList<>(List.of(existingProp)));
        dossier.setBeneficiaries(new ArrayList<>(List.of(existingBenef)));
        dossier.setRepresentatives(new ArrayList<>());
        dossier.setGuarantors(new ArrayList<>(List.of(guarantor)));


        DossierDataDto dossierDto = dossierDataMapper.convertToDTO(dossier);

        // ============================================
        // DTO: Propriétés
        // ============================================
        PropertyDto propUpdate = PropertyDto.builder()
                .id(1L)
                .uuid("p-1")
                .landCertificateNumber("NEW-LCN")
                .build();

        PropertyDto propNew = PropertyDto.builder()
                .id(null)
                .uuid("prop-new-uuid")
                .landCertificateNumber("BRAND-NEW")
                .rangs(null)
                .build();

        // ============================================
        // DTO: Bénéficiaire existant à mettre à jour
        // ============================================
        BeneficiaryDto benefUpdate = BeneficiaryDto.builder()
                .id(50L)  // ✅ ID du bénéficiaire existant
                .uuid("benef-existing-uuid")
                .firstname("NEW-FN")
                .properties(List.of(PropertyDto.builder().id(1L).uuid("p-1").build()))
                .rangs(List.of(
                        new RangDto(1L, 3, BigDecimal.valueOf(2000), 1L, null),    // Update
                        new RangDto(null, 2, BigDecimal.valueOf(500), 1L, null),   // Add
                        new RangDto(null, 2, BigDecimal.valueOf(500), 1L, null)    // Add (doublon)
                ))
                .build();

        // ============================================
        // DTO: Nouveau bénéficiaire
        // ============================================
        BeneficiaryDto benefNew = BeneficiaryDto.builder()
                .id(null)
                .uuid("benef-new-uuid")
                .firstname("GHOST")
                .properties(List.of(PropertyDto.builder().uuid("prop-new-uuid").build()))
                .rangs(List.of(
                        new RangDto(null, 1, BigDecimal.valueOf(1500), null, "prop-new-uuid"),
                        new RangDto(null, 2, BigDecimal.valueOf(500), null, "prop-new-uuid")
                ))
                .build();

        dossierDto.setPropertyData(PropertyDataDto.builder()
                .properties(List.of(propUpdate, propNew))
                .build());
        dossierDto.setBeneficiaries(List.of(benefUpdate, benefNew));
        dossierDto.setRepresentatives(new ArrayList<>());  // Empty representatives
        dossierDto.setDossierUsers(Collections.singleton(DossierUserDto.builder()
                .user(UserDto.builder().matricule("mat").build())
                .codeRole("INITIATOR")
                .codeProfession("CCP")
                .build()));

        // ============================================
        // MOCKS
        // ============================================
        given(dossierDataRepository.findByUuid(any())).willReturn(dossier);
        when(userService.getUserBy(anyString())).thenReturn(user);
        when(dossierUserRepository.findByIdDossierIdAndIdUserIdAndIdCodeRole(anyLong(), anyLong(), anyString()))
                .thenReturn(Optional.empty());
        when(dossierDataRepository.save(any(DossierData.class))).thenAnswer(i -> i.getArguments()[0]);
        when(dossierCreationContext.resolve(any())).thenReturn(dossierCreationStrategy);
        when(dossierCreationStrategy.create(any())).thenReturn(dossierDto);
        when(customerCardRepository.save(any(CustomerCard.class))).thenReturn(CustomerCard.builder().build());

        // ============================================
        // EXECUTE
        // ============================================
        DossierDataDto result = dossierDataService.update(dossierDto);

        // ============================================
        // ASSERTIONS: Result not null
        // ============================================
        assertNotNull(result);

        // ============================================
        // ASSERTIONS: Bénéficiaire mis à jour
        // ============================================
        Beneficiary benef1 = dossier.getBeneficiaries().stream()
                .filter(b -> Long.valueOf(50).equals(b.getId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Bénéficiaire 50 non trouvé"));

        assertEquals("NEW-FN", benef1.getFirstname());

        // Rang 2 doit être supprimé
        assertFalse(benef1.getRangs().stream().anyMatch(r -> Long.valueOf(2).equals(r.getId())),
                "Le rang ID 2 aurait dû être supprimé");

        // Rang 1 doit être mis à jour
        Rang r1 = benef1.getRangs().stream()
                .filter(r -> Long.valueOf(1).equals(r.getId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Rang 1 non trouvé"));
        assertEquals(3, r1.getRang());
        assertEquals(0, BigDecimal.valueOf(2000).compareTo(r1.getWarrantyAmount()));

        // 3 rangs : 1 update + 2 add
        assertEquals(3, benef1.getRangs().size(),
                "On attend 3 rangs : 1 update et 2 add");

        // ============================================
        // ASSERTIONS: Propriété nouvelle
        // ============================================
        Property pNew = dossier.getProperties().stream()
                .filter(p -> p.getId() == null)
                .findFirst()
                .orElseThrow(() -> new AssertionError("Propriété nouvelle non trouvée"));
        assertTrue(pNew.getRangs() == null || pNew.getRangs().isEmpty(),
                "Nouvelle propriété ne doit pas avoir de rangs");
        assertEquals(dossier, pNew.getDossier(), "Property dossier should be set");

        // ============================================
        // ASSERTIONS: Bénéficiaires count
        // ============================================
        assertEquals(2, dossier.getBeneficiaries().size(), "Should have 2 beneficiaries");

        // Nouveau bénéficiaire
        Beneficiary benef2 = dossier.getBeneficiaries().stream()
                .filter(b -> "benef-new-uuid".equals(b.getUuid()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Bénéficiaire benef-new-uuid non trouvé"));
        assertEquals("GHOST", benef2.getFirstname());
        assertEquals(2, benef2.getRangs().size());
        assertEquals(dossier, benef2.getDossier(), "New beneficiary dossier should be set");

        // ============================================
        // ASSERTIONS: Vérifier que les propriétés sont synchées
        // ============================================
        assertEquals(2, dossier.getProperties().size(), "Should have 2 properties");

        // Existing property should be updated
        Property updatedProp = dossier.getProperties().stream()
                .filter(p -> p.getId() != null && p.getId().equals(1L))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Updated property not found"));
        assertEquals("NEW-LCN", updatedProp.getLandCertificateNumber());

        // ============================================
        // VERIFY INTERACTIONS
        // ============================================
        verify(dossierDataRepository, atLeastOnce()).save(dossier);
        verify(dossierUserRepository, times(1)).save(any(DossierUser.class));
    }
	@Test
	void testUpdateCustomerFromDto_updatesOnlyNonNullFields() {
		DossierDataMapper mapper = Mappers.getMapper(DossierDataMapper.class);

		Customer entity = new Customer();
		entity.setId(100L);
		entity.setVersion(5);
		entity.setCode("OLD_CODE");
		entity.setLastName("OLD_LAST");
		entity.setFirstName("OLD_FIRST");
		entity.setSexe("M");
		entity.setBirthCountry("OLD_COUNTRY");

		Customer dto = new Customer();
		dto.setCode("NEW_CODE");
		dto.setFirstName("NEW_FIRST");
		dto.setBirthCountry(null);

		mapper.updateCustomerFromDto(dto, entity);

		assertThat(entity.getCode()).isEqualTo("NEW_CODE");
		assertThat(entity.getFirstName()).isEqualTo("NEW_FIRST");

		assertThat(entity.getLastName()).isEqualTo("OLD_LAST");
		assertThat(entity.getBirthCountry()).isEqualTo("OLD_COUNTRY");

		assertThat(entity.getId()).isEqualTo(100L);
		assertThat(entity.getVersion()).isEqualTo(5L);
	}

	@Test
	void testUpdateCustomerFromDto_whenDtoIsNull_doesNothing() {
		DossierDataMapper mapper = Mappers.getMapper(DossierDataMapper.class);

		Customer entity = new Customer();
		entity.setCode("CODE");

		mapper.updateCustomerFromDto(null, entity);

		assertThat(entity.getCode()).isEqualTo("CODE");
	}

	@Test
	void getByUuidTest() throws TechnicalException {
		DossierData dossier = new DossierData();
		dossier.setId(1L);
		Attachment attachment = Attachment.builder().uploadedAt(LocalDateTime.now()).build();
		DossierAttachmentType dat1 = DossierAttachmentType.builder()
				.attachments(Arrays.asList(attachment)).uuid(UUID.randomUUID().toString()).build();

		when(dossierDataRepository.findByUuid(any(String.class))).thenReturn(dossier);

		DossierDataDto retreivedDossierData = dossierDataService.getByUuid("uuid");

		when(dossierCreationContext.resolve(retreivedDossierData)).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(retreivedDossierData)).thenReturn(retreivedDossierData);
		assertEquals(dossier.getUuid(), retreivedDossierData.getUuid());
	}

	@Test
	void retrieveDossierAttachmentTypesTestOk() throws TechnicalException {
		DossierData dossier = DossierData.builder().codeProduct("PPI_CLASSIQUE").loanData(null).insuranceData(null)
				.guarantors(null).build();
		dossier.setId(1L);
		given(dossierDataRepository.findByUuid(any(String.class))).willReturn(dossier);

		RefAttachmentTypeDto rt1 = RefAttachmentTypeDto.builder().code("ATT1").designation("Attchment1").build();
		RefAttachmentTypeDto rt2 = RefAttachmentTypeDto.builder().code("ATT2").designation("Attchment2").build();
		RefAttachmentTypeDto rt3 = RefAttachmentTypeDto.builder().code("ATT3").designation("Attchment3").build();
		List<RefAttachmentTypeDto> refAttachmentTypes = Stream.of(rt1, rt2, rt3).collect(Collectors.toList());
		List<String> refAttachmentTypeCodes = new ArrayList<>();
		refAttachmentTypeCodes.addAll(refAttachmentTypes.stream().map(rt -> rt.getCode()).collect(Collectors.toList()));

		DossierAttachmentTypeDto dat1 = DossierAttachmentTypeDto.builder().codeRefAttachmentType(rt1.getCode())
				.completed(false).uuid(UUID.randomUUID().toString()).build();
		DossierAttachmentTypeDto dat2 = DossierAttachmentTypeDto.builder().codeRefAttachmentType(rt2.getCode())
				.completed(false).uuid(UUID.randomUUID().toString()).build();
		DossierAttachmentTypeDto dat3 = DossierAttachmentTypeDto.builder().codeRefAttachmentType(rt3.getCode())
				.completed(false).uuid(UUID.randomUUID().toString()).build();

		List<DossierAttachmentTypeDto> dossierAttachmentTypes = Stream.of(dat1, dat2, dat3)
				.collect(Collectors.toList());
		RefAttachmentTypesCodesDto attachmentTypesCodesDto = RefAttachmentTypesCodesDto.builder().refAttachmentTypesCodes(refAttachmentTypeCodes).build();
		when(dossierAttachmentTypeService.generateDossierAttachmentTypeList(any(DossierDataDto.class),
				eq(attachmentTypesCodesDto))).thenReturn(dossierAttachmentTypes);

		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(any(DossierDataDto.class));

		List<DossierAttachmentTypeDto> createdDats = dossierDataService.createDossierAttachmentTypes("uuid",
				attachmentTypesCodesDto);
		assertArrayEquals(createdDats.stream().map(DossierAttachmentTypeDto::getUuid).toArray(String[]::new),
				dossierAttachmentTypes.stream().map(DossierAttachmentTypeDto::getUuid).toArray(String[]::new));
	}

	@Test
	void retrieveDossierAttachmentTypesTestIllegalArgumentException() throws TechnicalException {


		when(dossierCreationContext.resolve(any())).thenThrow(new  TechnicalException("Dossier attachment type is illegal"));

		TechnicalException thrown = Assertions.assertThrows(TechnicalException.class,

				() -> dossierDataService.createDossierAttachmentTypes(null,  RefAttachmentTypesCodesDto.builder().refAttachmentTypesCodes(new ArrayList<>()).build() ));

		Assertions.assertEquals("You cannot perform this action", thrown.getMessage());

	}

	@Test
	void retrieveDossierAttachmentTypesTestNotFoundException() throws NotFoundException {
		when(dossierCreationContext.resolve(any())).thenThrow(new  TechnicalException("Dossier attachment not found"));
		TechnicalException thrown = Assertions.assertThrows(TechnicalException.class,
				() -> dossierDataService.createDossierAttachmentTypes("uuid", RefAttachmentTypesCodesDto.builder().refAttachmentTypesCodes(new ArrayList<>()).build() ));

		Assertions.assertEquals("Dossier not exists", thrown.getMessage());
	}



	@Test
	void getDossierAttachmentTypesTest() {
		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(any(DossierDataDto.class));
		dossierDataService.getDossierAttachmentTypes("uuid");
		verify(dossierAttachmentTypeService).getDossierAttachmentTypeList(anyString());
	}

	@Test
	void getDossierUserTestOK() {
		List<DossierUser> listDossierUser = new ArrayList<>();
		listDossierUser.add(DossierUser.builder()
				.profession("Employe")
				.user(User.builder()
						.agencyCode("A15554")
						.agencyDesignation("Agency")
						.lastname("User last name")
						.firstname("user first name")
						.drCode("DR")
						.drppCode("DRPP")
						.build())
				.id(DossierUserKey.builder().userId(1l).codeRole("INITIATOR").build())
				.build());
		DossierDataDto dossierDataDto	= DossierDataDto.builder()
				.uuid(UUID.randomUUID().toString())
				.codeDossier("OOOO2")
				.build();
		when(dossierUserRepository.findByDossierUuidAndUserMatricule(anyString(), anyString()))
				.thenReturn(listDossierUser);
		when(dossierCreationContext.resolve(dossierDataDto)).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(dossierDataDto)).thenReturn(dossierDataDto);

		List<DossierUserDto> results = dossierDataService.getDossierUser(anyString(),anyString());
		assertNotNull(results);
	}

	@Test
	void getDossierUserByUuidTestOK() {
		List<DossierUser> listDossierUser = new ArrayList<>();
		listDossierUser.add(DossierUser.builder()
				.profession("Employe")
				.user(User.builder()
						.agencyCode("A15554")
						.agencyDesignation("Agency")
						.lastname("User last name")
						.firstname("user first name")
						.drCode("DR")
						.drppCode("DRPP")
						.build())
				.id(DossierUserKey.builder().userId(1l).codeRole("INITIATOR").build())
				.build());
		DossierDataDto dossierDataDto	= DossierDataDto.builder()
				.uuid(UUID.randomUUID().toString())
				.codeDossier("OOOO2")
				.build();
		when(dossierUserRepository.findByDossierUuid(anyString()))
				.thenReturn(listDossierUser);

		when(dossierCreationContext.resolve(dossierDataDto)).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(dossierDataDto)).thenReturn(dossierDataDto);

		List<DossierUserDto> results = dossierDataService.getDossierUserByUuid(anyString());
		assertNotNull(results);
	}


	@Test
	void createReassignmentRequestOkTest()  {
		String uuid=UUID.randomUUID().toString();
		ReassignmentRequestDto reassignmentRequestDto=ReassignmentRequestDto
				.builder()
				.uuid(uuid)
				.dossier(DossierDataDto.builder().codeDossier("00012333").build())
				.requestStatus("IN_PROGRESS")
				.build();
		DossierData dossier = DossierData.builder().codeProduct("PPI_CLASSIQUE")
				.status(DossierStatus.TO_VALIDATE_STATMENT.toString())
				.loanData(LoanData.builder().loanAmount(new BigDecimal(1000)).build())
				.customerData(CustomerCard.builder()
						.customer(Customer.builder().firstName("firstName").lastName("lastName").build()).build())
				.build();
		when(dossierDataRepository.findByUuid(anyString())).thenReturn(dossier);
		when(reassignmentRequestRepository.save(any(ReassignmentRequest.class))).thenReturn(ReassignmentRequest.builder().dossier(dossier).build());
		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(any(DossierDataDto.class));

		ReassignmentRequestDto reassignmentRequest = dossierDataService.createReassignmentRequest(reassignmentRequestDto);
		assertNotNull(reassignmentRequest);
	}

	@Test
	void createReassignmentRequest_DossierNull()  {
		ReassignmentRequestDto reassignmentRequestDto=ReassignmentRequestDto
				.builder()
				.requestStatus("IN_PROGRESS")
				.build();
		when(dossierCreationContext.resolve(any())).thenThrow(new  TechnicalException("Dossier is required"));
		assertThrows(TechnicalException.class,
				()-> dossierDataService.createReassignmentRequest(reassignmentRequestDto));

	}

	@Test
	void getLastReassignInprogressOkTest()  {
		String uuid=UUID.randomUUID().toString();
		DossierData dossierData = DossierData.builder()
				.status(DossierStatus.INIT.toString())
				.build();
		ReassignmentRequest reassignmentRequestDto=ReassignmentRequest
				.builder()
				.dossier(dossierData)
				.requestStatus("IN_PROGRESS")
				.build();
		DossierDataDto first = DossierDataDto.builder()
				.codeDossier("hi")
				.build();


		when(reassignmentRequestRepository.findFirstByRequestStatusAndDossierUuidOrderByCreatedAtDesc(anyString(),any())).thenReturn(Optional.of(reassignmentRequestDto));

		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(first);


		ReassignmentRequestDto reassignmentRequest = dossierDataService.getLastReassignInprogress(uuid);
		assertNotNull(reassignmentRequest);
	}

	@Test
	void getReassignRequestByUuidTest_OK()  {
		String uuid=UUID.randomUUID().toString();
		ReassignmentRequest reassignmentRequestDto=ReassignmentRequest
				.builder()
				.dossier(DossierData.builder().status(DossierStatus.INIT.toString()).build())
				.requestStatus("IN_PROGRESS")
				.build();

		when(reassignmentRequestRepository.findByUuid(uuid)).thenReturn(reassignmentRequestDto);

		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(any(DossierDataDto.class));

		ReassignmentRequestDto reassignmentRequest = dossierDataService.getReassignRequestByUuid(uuid);
		assertNotNull(reassignmentRequest);
	}

	@Test
	void updateReassignmentRequestTest_OK()  {
		String uuid=UUID.randomUUID().toString();
		ReassignmentRequestDto reassignmentRequestDto=ReassignmentRequestDto
				.builder()
				.uuid(uuid)
				.dossier(DossierDataDto.builder().codeDossier("00012333").build())
				.requestStatus("ACCEPTED")
				.build();
		DossierData dossier = DossierData.builder().codeProduct("PPI_CLASSIQUE")
				.status(DossierStatus.INCA_VALD.toString())
				.loanData(LoanData.builder().loanAmount(new BigDecimal(100000)).build())
				.build();
		when(reassignmentRequestRepository.findByUuid(anyString())).thenReturn(ReassignmentRequest.builder().dossier(dossier).build());
		when(reassignmentRequestRepository.save(any(ReassignmentRequest.class))).thenReturn(ReassignmentRequest.builder().dossier(dossier).build());
		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(any(DossierDataDto.class));
		ReassignmentRequestDto reassignmentRequest = dossierDataService.updateReassignRequest(reassignmentRequestDto);
		assertNotNull(reassignmentRequest);
	}

	@Test
	void updateWarrantiesAndRestrictions() {
		List<WarrantyDto> warranties = new ArrayList<>();
		warranties.add(WarrantyDto.builder()
				.type(WarrantyType.PROPOSED).content("Warr001").build());

		List<RestrictionDto> restrictions = new ArrayList<>();
		restrictions.add(RestrictionDto.builder().content("Rest001").type(RestrictionType.PROPOSED_DSC).build());
		restrictions.add(RestrictionDto.builder().content("Rest002").type(RestrictionType.PROPOSED_OBSERVATION).build());
		restrictions.add(RestrictionDto.builder().content("Rest003").type(RestrictionType.PROPOSED_FRONT).build());
		DossierDataDto dossierDto = DossierDataDto.builder()
				.uuid(UUID.randomUUID().toString())
				.warranties(warranties)
				.restrictions(restrictions)
				.build();
		List<Warranty> warrantyList = new ArrayList<>();
		List<Restriction> restrictionList = new ArrayList<>();

		DossierData dossier = DossierData.builder().codeProduct("PPI_CLASSIQUE").warranties(warrantyList).restrictions(restrictionList).build();
		dossier.setId(1L);
		dossier.setUuid(UUID.randomUUID().toString());

		when(dossierDataRepository.save(any(DossierData.class))).thenReturn(dossier);
		given(dossierDataRepository.findByUuid(any(String.class))).willReturn(dossier);
		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(any(DossierDataDto.class));
		DossierDataDto savedDossierData = dossierDataService.updateWarrantiesAndRestrictions(dossierDto);

		assertNotNull(savedDossierData);
		assertEquals(1, savedDossierData.getWarranties().size());
		assertEquals(3, savedDossierData.getRestrictions().size());
	}


	@ParameterizedTest
	@CsvSource({
			"INIT, BLOCKED_INIT, false, false, false",
			"BLOCKED_INIT, BLOCKED_INCA_VALD, false, false, false",
			"BLOCKED_INIT, INIT, true,false, false",
			"BLOCKED_INCA_VALD, INCA_VALD, true,false, false",
			"ACCD, ACCD, true,false, false",
			"BLOCKED_INCA_VALD, BLOCKED_INCA_VALD, false, false, false",
			"BLOCKED_INCA_VALD, BLOCKED_INCA_VALD, false, false, false",
	})
	void updateCustomerDataAndInternalLoansTest_WithVariousStatuses(String initialStatus, String expectedStatus, boolean isKyc, boolean customerDataNull, boolean cardNull) {
		DossierData dossierData = new DossierData();

		dossierData.setCustomerData(CustomerCard.builder()
				.customer(Customer.builder().cardId("cardId").build())
				.build());

		dossierData.setUuid("dossier-uuid");
		dossierData.setDebts(new ArrayList<>());
		dossierData.setStatus(initialStatus);

		DossierDataDto dossierDataDto = DossierDataDto.builder()
				.uuid("dossier-uuid")
				.customerData(
						CustomerCardDto.builder()
								.prospect(true)
								.card(CardDto.builder().isKyc(isKyc).email("email").build())
								.balanceActivity(BalanceActivityDto.builder().averageBalance("string").build())
								.build()
				)
				.codeStatus(expectedStatus)
				.debts(Collections.singletonList(DebtDto.builder()
						.amendmentNumber(1).fileNumber("fileNumber").build()))
				.build();

		if(customerDataNull){ dossierDataDto.setCustomerData(null);}
		if(cardNull){
			dossierDataDto.getCustomerData().setCard(null);
			dossierDataDto.getCustomerData().setBalanceActivity(null);
			dossierDataDto.setDebts(null);
		}


		given(dossierDataRepository.findByUuid("dossier-uuid")).willReturn(dossierData);
		given(dossierDataRepository.save(dossierData)).willReturn(dossierData);
		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(dossierDataDto);


		DossierDataDto result = dossierDataService.updateCustomerDataAndInternalLoans(dossierDataDto);

		assertNotNull(result);
		verify(dossierDataRepository, times(1)).save(dossierData);
		assertEquals(expectedStatus, dossierData.getStatus());


	}
	@ParameterizedTest
	@CsvSource({
			"INIT, BLOCKED_INIT, false, false, false",
			"BLOCKED_INIT, BLOCKED_INCA_VALD, false, false, false",
			"BLOCKED_INIT, INIT, true, false, false",
			"BLOCKED_INCA_VALD, INCA_VALD, true, false, false",
			"ACCD, ACCD, true, false, false",
			"BLOCKED_INCA_VALD, BLOCKED_INCA_VALD, false, false, false",
			"BLOCKED_INCA_VALD, BLOCKED_INCA_VALD, false, false, false"
	})
	void updateCustomerDataAndInternalLoansTest_WithVariousStatuse(
			String initialStatus,
			String expectedStatus,
			boolean isKyc,
			boolean customerDataNull,
			boolean cardNull
	) {

		DossierData oldDossier = new DossierData();
		oldDossier.setUuid("dossier-uuid");
		oldDossier.setStatus(initialStatus);
		oldDossier.setDebts(new ArrayList<>());

		Customer oldCustomer = Customer.builder()
				.code("OLD_CODE")
				.lastName("OLD_LAST")
				.firstName("OLD_FIRST")
				.cardId("OLD_CARD_ID")
				.sexe("M")
				.build();

		oldDossier.setCustomerData(CustomerCard.builder()
				.customer(oldCustomer)
				.build()
		);

		DossierDataDto dto = DossierDataDto.builder()
				.uuid("dossier-uuid")
				.codeStatus(expectedStatus)
				.customerData(
						CustomerCardDto.builder()
								.prospect(true)
								.card(CardDto.builder().isKyc(isKyc).email("email").build())
								.balanceActivity(BalanceActivityDto.builder().averageBalance("string").build())
								.customer(CustomerDto.builder()
										.code("NEW_CODE")
										.lastName("NEW_LAST")
										.firstName("NEW_FIRST")
										.cardId("NEW_CARD_ID")
										.sexe("F")
										.build())
								.build()
				)
				.debts(Collections.singletonList(
						DebtDto.builder().amendmentNumber(1).fileNumber("fileNumber").build()
				))
				.build();

		if (customerDataNull) {
			dto.setCustomerData(null);
		}

		if (cardNull && dto.getCustomerData() != null) {
			dto.getCustomerData().setCard(null);
			dto.getCustomerData().setBalanceActivity(null);
			dto.setDebts(null);
		}

		given(dossierDataRepository.findByUuid("dossier-uuid")).willReturn(oldDossier);
		given(dossierDataRepository.save(any())).willAnswer(inv -> inv.getArgument(0));
		when(dossierCreationContext.resolve(any())).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any())).thenReturn(dto);

		DossierDataDto result = dossierDataService.updateCustomerDataAndInternalLoans(dto);

		assertNotNull(result);
		verify(dossierDataRepository, times(1)).save(oldDossier);
		assertEquals(expectedStatus, oldDossier.getStatus());

		Customer updatedCustomer = oldDossier.getCustomerData().getCustomer();

		if (customerDataNull) {

			assertEquals("OLD_CODE", updatedCustomer.getCode());
			assertEquals("OLD_LAST", updatedCustomer.getLastName());
			assertEquals("OLD_FIRST", updatedCustomer.getFirstName());
			assertEquals("OLD_CARD_ID", updatedCustomer.getCardId());
			assertEquals("M", updatedCustomer.getSexe());

			assertNull(updatedCustomer.getBirthDate());
			assertNull(updatedCustomer.getBirthCountry());
			assertNull(updatedCustomer.getCardType());
			assertNull(updatedCustomer.getCreationDate());
			assertNull(updatedCustomer.getBranchCode());
			assertNull(updatedCustomer.getBranchDesignation());

		} else {

			CustomerDto dtoCustomer = dto.getCustomerData().getCustomer();

			if (dtoCustomer.getCode() != null)
				assertEquals(dtoCustomer.getCode(), updatedCustomer.getCode());
			else
				assertEquals("OLD_CODE", updatedCustomer.getCode());

			if (dtoCustomer.getLastName() != null)
				assertEquals(dtoCustomer.getLastName(), updatedCustomer.getLastName());
			else
				assertEquals("OLD_LAST", updatedCustomer.getLastName());

			if (dtoCustomer.getFirstName() != null)
				assertEquals(dtoCustomer.getFirstName(), updatedCustomer.getFirstName());
			else
				assertEquals("OLD_FIRST", updatedCustomer.getFirstName());

			if (dtoCustomer.getSexe() != null)
				assertEquals(dtoCustomer.getSexe(), updatedCustomer.getSexe());
			else
				assertEquals("M", updatedCustomer.getSexe());

			if (dtoCustomer.getBirthDate() != null)
				assertEquals(dtoCustomer.getBirthDate(), updatedCustomer.getBirthDate());

			if (dtoCustomer.getBirthCountry() != null)
				assertEquals(dtoCustomer.getBirthCountry(), updatedCustomer.getBirthCountry());

			if (dtoCustomer.getCardType() != null)
				assertEquals(dtoCustomer.getCardType(), updatedCustomer.getCardType());

			if (dtoCustomer.getCardId() != null)
				assertEquals(dtoCustomer.getCardId(), updatedCustomer.getCardId());
			else
				assertEquals("OLD_CARD_ID", updatedCustomer.getCardId());

			if (dtoCustomer.getCreationDate() != null)
				assertEquals(dtoCustomer.getCreationDate(), updatedCustomer.getCreationDate());

			if (dtoCustomer.getBranchCode() != null)
				assertEquals(dtoCustomer.getBranchCode(), updatedCustomer.getBranchCode());

			if (dtoCustomer.getBranchDesignation() != null)
				assertEquals(dtoCustomer.getBranchDesignation(), updatedCustomer.getBranchDesignation());
		}

		if (cardNull) {
			assertNull(oldDossier.getCustomerData().getCard());
			assertNull(oldDossier.getCustomerData().getBalanceActivity());
		} else {
			assertNotNull(oldDossier.getCustomerData().getCard());
			assertNotNull(oldDossier.getCustomerData().getBalanceActivity());
		}
	}


	@Test
	void searchDossierListTest_OK() {
		DossierDataCriteria dossierDataCriteria = DossierDataCriteria.builder()
				.listType(DossierListEnum.ALL_DOSSIERS)
				.eligibleMarketCodes(Collections.emptyList())
				.build();

		SearchRequest<DossierDataCriteria> searchRequest = new SearchRequest<>();
		searchRequest.setSearchCriteria(dossierDataCriteria);
		searchRequest.setPage(0);
		searchRequest.setItemsPerPage(10);

		Pageable paging = PageRequest.of(0, 10);

		DossierKpiView dossierKpiView = new DossierKpiView();
		Page<DossierKpiView> dossierKpiViewPage = new PageImpl<>(singletonList(dossierKpiView));

		when(dossierDataRepository.search(any(Specification.class), eq(paging), eq(dossierDataCriteria.getListType())))
				.thenReturn(dossierKpiViewPage);

		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(any(DossierDataDto.class));

		SearchResponse result = dossierDataService.searchDossierList(searchRequest);

		Assertions.assertEquals(1, result.getCurrentPage());
		Assertions.assertEquals(1, result.getNumberOfElementsPerPage());
		Assertions.assertEquals(1, result.getTotalPages());
		Assertions.assertEquals(1, result.getNumberOfElementsInPage());
	}

	@Test
	void deleteDossierByUuid() {
		doNothing().when(dossierDataRepository).delete(any(DossierData.class));
		when(dossierDataRepository.findByUuid(anyString())).thenReturn(mock(DossierData.class));
		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(any(DossierDataDto.class));
		dossierDataService.delete("uuid");
		verify(dossierDataRepository, times(1)).deleteDossier(any(DossierData.class));
	}
	@Test
	void testApplyRestrictionsAndWarrantiesChanges_Success() {
		String uuid = "test-uuid";
		NotificationGeneratorDto notificationGeneratorDto = new NotificationGeneratorDto();
		notificationGeneratorDto.setRestrictions(Collections.singletonList(new RestrictionDto()));
		notificationGeneratorDto.setWarranties(Collections.singletonList(new WarrantyDto()));
		DossierData mockDossierData = new DossierData();
		mockDossierData.setRestrictions(new ArrayList<>());

		DossierRequest mockDossierRequest = new DossierRequest();
		mockDossierRequest.setRequestWarranties(new ArrayList<>());
		when(dossierDataRepository.findByUuid(anyString())).thenReturn(mockDossierData);
		when(dossierRequestRepository.findFirstByRequestStatusAndDossierUuidOrderByCreatedAtDesc(anyString(),anyString()))
				.thenReturn(Optional.of(mockDossierRequest));

		when(dossierRequestRepository.save(any(DossierRequest.class))).thenReturn(mockDossierRequest);
		when(dossierDataRepository.save(any(DossierData.class))).thenReturn(mockDossierData);

		when(dossierCreationContext.resolve(any(DossierDataDto.class))).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(any(DossierDataDto.class))).thenReturn(any(DossierDataDto.class));

		DossierDataDto result = dossierDataService.applyRestrictionsAndWarrantiesChanges(uuid, notificationGeneratorDto);
		assertNotNull(result);
		verify(dossierDataRepository).findByUuid(uuid);
		verify(dossierRequestRepository).save(mockDossierRequest);
		verify(dossierDataRepository).save(mockDossierData);
	}

	@Test
	void testApplyRestrictionsAndWarrantiesChanges_InvalidUUID() {
		String uuid = "invalid-uuid";
		NotificationGeneratorDto notificationGeneratorDto = new NotificationGeneratorDto();
		when(dossierDataRepository.findByUuid(uuid)).thenReturn(null);
		when(dossierCreationContext.resolve(any(DossierDataDto.class)))
				.thenThrow(new TechnicalException(ErrorsConstants.DOSSIER_DATA_NOT_FOUND_DSC));

		assertThrows(TechnicalException.class, () -> {
			dossierDataService.applyRestrictionsAndWarrantiesChanges(uuid, notificationGeneratorDto);
		});
	}
    @Test
    void getByUuid_shouldFillAllDates_whenTasksExist() {
        String uuid = "dossier-uuid";
        LocalDateTime dateOpcv = LocalDateTime.of(2024, 4, 1, 12, 0);
        LocalDateTime dateDecs = LocalDateTime.of(2024, 4, 2, 13, 0);
        LocalDateTime dateTdsc = LocalDateTime.of(2024, 4, 3, 14, 0);

        List<Task> tasks = Arrays.asList(
                createTask(uuid, DossierStatus.OPCV.name(), dateOpcv),
                createTask(uuid, DossierStatus.DECS.name(), dateDecs),
                createTask(uuid, DossierStatus.TDSC_GEN.name(), dateTdsc)
        );

        when(taskRepository.findByDossierUuidAndDossierCodeStatusIn(eq(uuid), anyList()))
                .thenReturn(tasks);

        DossierData dossier = new DossierData();
        dossier.setUuid(uuid);
        dossier.setId(1L);
        when(dossierDataRepository.findByUuid(uuid)).thenReturn(dossier);

        DossierDataDto dto = dossierDataService.getByUuid(uuid);

        assertEquals(dateOpcv, dto.getValidationOpcDate());
        assertEquals(dateDecs, dto.getApprovalDate());
        assertEquals(dateTdsc, dto.getDscTransferDate());
    }
    private Task createTask(String uuid, String status, LocalDateTime date) {
        Task t = new Task();
        t.setDossierUuid(uuid);
        t.setDossierCodeStatus(status);
        t.setEntryDate(date);
        return t;
    }

	@Test
	void testConvertToDTO_viaService() {
		Property property = new Property();
		property.setId(1L);
		property.setCapital("Maison");

		DossierData dossierData = new DossierData();
		dossierData.setStatus("ACTIVE");
		dossierData.setCoFinancing(true);
		dossierData.setProperties(List.of(property));

		DossierDataDto dto = dossierDataMapper.convertToDTO(dossierData);

		assertNotNull(dto);
		assertEquals("ACTIVE", dto.getCodeStatus());
		assertTrue(dto.getPropertyData().getCoFinancing());
		assertEquals("Maison", dto.getPropertyData().getProperties().get(0).getCapital());
	}

	@Test
	void testSaveAmortizableLoanDetail_OK(){
		AmortizableLoanDetailDto dto = AmortizableLoanDetailDto.builder()
				.dossierUuid(UUID.randomUUID().toString())
				.uuid("uuid")
				.customerName("name")
				.build();
		AmortizableLoanDetail entity = AmortizableLoanDetail.builder()
				.dossierUuid(UUID.randomUUID().toString())
				.customerName("name")
				.build();
		entity.setId(1L);
		when(amortizableLoanRepository.findByDossierUuid(dto.getDossierUuid())).thenReturn(Optional.of(entity));
		when(amortizableLoanRepository.save(any())).thenReturn(entity);

		AmortizableLoanDetailDto saved = dossierDataService.saveAmortizableLoanDetail(dto);
		assertNotNull(saved);
		assertEquals(dto.getCustomerName(), saved.getCustomerName());
	}

	@Test
	void testSaveAmortizableLoanDetail_KO(){
		AmortizableLoanDetailDto dto = AmortizableLoanDetailDto.builder()
				.uuid("uuid")
				.customerName("name")
				.build();

		TechnicalException thrown = Assertions.assertThrows(TechnicalException.class,
				() -> dossierDataService.saveAmortizableLoanDetail(dto));

		Assertions.assertEquals("Amortizable loan detail Or Dossier uuid must be not null", thrown.getMessage());
	}

	@Test
	void updateDossierAndTask_ShouldSucceed() {
		String uuid = "uuid-test-123";
		DossierDataDto dossierDto = DossierDataDto.builder()
				.uuid(uuid)
				.build();

		TaskDto taskDto = new TaskDto();
		taskDto.setId(1L);

		UpdateDossierAndTaskRequest request = UpdateDossierAndTaskRequest.builder()
				.dossier(dossierDto)
				.task(taskDto)
				.build();

		DossierData dossierEntity = new DossierData();
		dossierEntity.setUuid(uuid);
		dossierEntity.setId(1L);
		dossierEntity.setGuarantors(new ArrayList<>());
		dossierEntity.setWarranties(new ArrayList<>());
		dossierEntity.setBeneficiaries(new ArrayList<>());
        dossierEntity.setRepresentatives(new ArrayList<>());
        dossierEntity.setProperties(new ArrayList<>());
        dossierEntity.setComments(new ArrayList<>());
        dossierEntity.setRestrictions(new ArrayList<>());
        dossierEntity.setDebts(new ArrayList<>());
        dossierEntity.setDebtsinfon(new ArrayList<>());
		User user = User.builder().build();
		user.setId(1L);
		given(dossierDataRepository.findByUuid(any(String.class))).willReturn(dossierEntity);
		when(userService.getUserBy(anyString())).thenReturn(user);
		when(dossierUserRepository.findByIdDossierIdAndIdUserIdAndIdCodeRole(dossierEntity.getId(), user.getId(), "INITIATOR"))
				.thenReturn(Optional.empty());
		when(customerCardRepository.save(any(CustomerCard.class))).thenReturn(CustomerCard.builder().build());
		when(customerRepository.findByCode(anyString())).thenReturn(Customer.builder().build());

		when(dossierDataRepository.save(any(DossierData.class))).thenReturn(dossierEntity);


		when(dossierCreationContext.resolve(dossierDto)).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(dossierDto)).thenReturn(dossierDto);

		DossierDataDto result = dossierDataService.updateDossierAndTask(request);

		assertNotNull(result);
		assertEquals(uuid, result.getUuid());

		verify(taskService).update(taskDto);

		verify(dossierDataRepository, atLeastOnce()).save(any(DossierData.class));
	}
    @Test
    void givenDossierWithRepresentatives_whenSyncRepresentatives_thenHandleAllAssociationTypes() {
        Customer customer = Customer.builder().firstName("Cust").build();
        customer.setId(300L);

        Beneficiary beneficiary = Beneficiary.builder()
                .firstname("Ben").idCardNumber("BEN123").build();
        beneficiary.setId(100L);

        Guarantor guarantor = Guarantor.builder()
                .firstName("Guar").idCardNumber("GAR123").build();
        guarantor.setId(200L);
		guarantor.setUuid(UUID.randomUUID().toString());

        DossierData dossier = new DossierData();
        dossier.setId(1L);
        dossier.setCustomerData(CustomerCard.builder().customer(customer).build());
        dossier.setBeneficiaries(new ArrayList<>(List.of(beneficiary)));
        dossier.setGuarantors(new ArrayList<>(List.of(guarantor)));

        Representative existingRep = new Representative();
        existingRep.setId(50L);
        existingRep.setFirstname("OldRep");
        existingRep.setBeneficiaryAssociations(new ArrayList<>(List.of(
                RepresentativeBeneficiary.builder().beneficiary(beneficiary).build()
        )));
        existingRep.setGuarantorAssociations(new ArrayList<>());
        existingRep.setCustomerAssociations(new ArrayList<>());
        dossier.setRepresentatives(new ArrayList<>(List.of(existingRep)));

        RepresentativeBeneficiaryDto benDto = RepresentativeBeneficiaryDto.builder()
                .beneficiary(BeneficiaryDto.builder().id(100L).idCardNumber("BEN123").build())
                .proxyDate(LocalDate.of(2026, 5, 26))
                .build();

        RepresentativeGuarantorDto garDto = RepresentativeGuarantorDto.builder()
                .guarantor(GuarantorDto.builder().id(200L).idCardNumber("GAR123").build())
                .proxyDate(LocalDate.of(2026, 5, 26))
                .build();

        RepresentativeCustomerDto custDto = RepresentativeCustomerDto.builder()
                .customer(CustomerDto.builder().firstName("Cust").build())
                .proxyDate(LocalDate.of(2026, 5, 26))
                .build();

        RepresentativeDto repDto = RepresentativeDto.builder()
                .id(50L)
                .firstname("UpdatedRep")
                .lastname("Updated")
                .cin("CIN123")
                .beneficiaries(List.of(benDto))
                .guarantors(List.of(garDto))
                .customer(custDto)
                .build();

        DossierDataDto dossierDto = DossierDataDto.builder()
                .representatives(List.of(repDto))
                .build();

        dossierDataService.syncRepresentatives(dossierDto, dossier, new HashMap<>(), new HashMap<>());

        assertEquals(1, dossier.getRepresentatives().size());
        Representative updatedRep = dossier.getRepresentatives().get(0);
        assertEquals("UpdatedRep", updatedRep.getFirstname());
        assertEquals("Updated", updatedRep.getLastname());
        assertEquals("CIN123", updatedRep.getCin());
        assertEquals(0, updatedRep.getBeneficiaryAssociations().size());
        assertEquals(0, updatedRep.getGuarantorAssociations().size());
        assertEquals(1, updatedRep.getCustomerAssociations().size());
    }

    @Test
    void givenDossierWithRepresentatives_whenSyncRepresentativesEdgeCases_thenHandleCorrectly() {
        DossierData dossier = new DossierData();
        dossier.setId(1L);
        dossier.setCustomerData(null);
        dossier.setBeneficiaries(new ArrayList<>());
        dossier.setGuarantors(new ArrayList<>());

        Representative oldRep = new Representative();
        oldRep.setId(80L);
        oldRep.setBeneficiaryAssociations(new ArrayList<>(List.of(
                RepresentativeBeneficiary.builder().build()
        )));
        oldRep.setGuarantorAssociations(new ArrayList<>(List.of(
                RepresentativeGuarantor.builder().build()
        )));
        oldRep.setCustomerAssociations(new ArrayList<>(List.of(
                RepresentativeCustomer.builder().build()
        )));
        dossier.setRepresentatives(new ArrayList<>(List.of(oldRep)));

        DossierDataDto dossierDto1 = DossierDataDto.builder()
                .representatives(null)
                .build();

        dossierDataService.syncRepresentatives(dossierDto1, dossier, new HashMap<>(), new HashMap<>());
        assertEquals(0, dossier.getRepresentatives().size());

        oldRep = new Representative();
        oldRep.setId(81L);
        oldRep.setBeneficiaryAssociations(new ArrayList<>());
        oldRep.setGuarantorAssociations(new ArrayList<>());
        oldRep.setCustomerAssociations(new ArrayList<>());
        dossier.setRepresentatives(new ArrayList<>(List.of(oldRep)));

        DossierDataDto dossierDto2 = DossierDataDto.builder()
                .representatives(Collections.emptyList())
                .build();

        dossierDataService.syncRepresentatives(dossierDto2, dossier, new HashMap<>(), new HashMap<>());
        assertEquals(0, dossier.getRepresentatives().size());

        dossier.setRepresentatives(new ArrayList<>());
        RepresentativeDto newRepDto = RepresentativeDto.builder()
                .firstname("NewRep")
                .lastname("Fresh")
                .cin("NEWCIN")
                .cinIssuedAt(LocalDate.of(2026, 5, 20))
                .build();

        DossierDataDto dossierDto3 = DossierDataDto.builder()
                .representatives(List.of(newRepDto))
                .build();

        dossierDataService.syncRepresentatives(dossierDto3, dossier, new HashMap<>(), new HashMap<>());
        assertEquals(1, dossier.getRepresentatives().size());
        Representative addedRep = dossier.getRepresentatives().get(0);
        assertEquals("NewRep", addedRep.getFirstname());
        assertEquals("Fresh", addedRep.getLastname());
        assertEquals("NEWCIN", addedRep.getCin());
        assertEquals(dossier, addedRep.getDossier());

        Beneficiary dummyBen = Beneficiary.builder().idCardNumber("NOMATCH").build();
        dossier.setBeneficiaries(new ArrayList<>(List.of(dummyBen)));

        Representative rep4 = new Representative();
        rep4.setId(82L);
        rep4.setBeneficiaryAssociations(new ArrayList<>());
        rep4.setGuarantorAssociations(new ArrayList<>());
        rep4.setCustomerAssociations(new ArrayList<>());
        dossier.setRepresentatives(new ArrayList<>(List.of(rep4)));

        RepresentativeBeneficiaryDto mismatchBenDto = RepresentativeBeneficiaryDto.builder()
                .beneficiary(BeneficiaryDto.builder().id(888L).idCardNumber("MISMATCH").build())
                .proxyDate(LocalDate.of(2026, 5, 26))
                .build();

        RepresentativeDto repDto4 = RepresentativeDto.builder()
                .id(82L)
                .firstname("Rep")
                .beneficiaries(List.of(mismatchBenDto))
                .build();

        DossierDataDto dossierDto4 = DossierDataDto.builder()
                .representatives(List.of(repDto4))
                .build();

        dossierDataService.syncRepresentatives(dossierDto4, dossier, new HashMap<>(), new HashMap<>());
        assertEquals(0, dossier.getRepresentatives().get(0).getBeneficiaryAssociations().size());

        dossier.setBeneficiaries(new ArrayList<>(List.of(
                Beneficiary.builder().idCardNumber("BEN123").build()
        )));

        RepresentativeBeneficiaryDto noProxyDto = RepresentativeBeneficiaryDto.builder()
                .beneficiary(BeneficiaryDto.builder().id(100L).idCardNumber("BEN123").build())
                .proxyDate(null)
                .build();

        RepresentativeDto repDto5 = RepresentativeDto.builder()
                .id(82L)
                .firstname("Rep")
                .beneficiaries(List.of(noProxyDto))
                .build();

        DossierDataDto dossierDto5 = DossierDataDto.builder()
                .representatives(List.of(repDto5))
                .build();

        dossierDataService.syncRepresentatives(dossierDto5, dossier, new HashMap<>(), new HashMap<>());
        assertEquals(0, dossier.getRepresentatives().get(0).getBeneficiaryAssociations().size());

        dossier.setCustomerData(null);
        RepresentativeCustomerDto nullCustDto = RepresentativeCustomerDto.builder()
                .customer(CustomerDto.builder().firstName("Cust").build())
                .proxyDate(LocalDate.of(2026, 5, 26))
                .build();

        RepresentativeDto repDto6 = RepresentativeDto.builder()
                .id(82L)
                .firstname("Rep")
                .customer(nullCustDto)
                .build();

        DossierDataDto dossierDto6 = DossierDataDto.builder()
                .representatives(List.of(repDto6))
                .build();

        dossierDataService.syncRepresentatives(dossierDto6, dossier, new HashMap<>(), new HashMap<>());
        assertEquals(0, dossier.getRepresentatives().get(0).getCustomerAssociations().size());
    }


        @Test
        void givenRepresentativeWithBeneficiaryAssociations_whenToDto_thenMapsCorrectly() {
            Representative representative = new Representative();
            representative.setId(1L);
            representative.setFirstname("John");
            representative.setLastname("Doe");
            representative.setCin("CIN123");
            representative.setCinIssuedAt(LocalDate.of(2026, 5, 24));

            Beneficiary beneficiary = Beneficiary.builder()
                    .firstname("Ben")
                    .lastname("Eficiary")
                    .idCardNumber("BEN123")
                    .issuedAt(LocalDate.of(2020, 1, 1))
                    .build();

            RepresentativeBeneficiary association = RepresentativeBeneficiary.builder()
                    .beneficiary(beneficiary)
                    .proxyDate(LocalDate.of(2026, 5, 26))
                    .build();

            representative.setBeneficiaryAssociations(new ArrayList<>(List.of(association)));
            representative.setGuarantorAssociations(new ArrayList<>());
            representative.setCustomerAssociations(new ArrayList<>());

            RepresentativeDto dto = representativeMapper.toDto(representative);

            assertNotNull(dto);
            assertEquals(1L, dto.getId());
            assertEquals("John", dto.getFirstname());
            assertEquals("Doe", dto.getLastname());
            assertEquals("CIN123", dto.getCin());
            assertNotNull(dto.getBeneficiaries());
            assertEquals(1, dto.getBeneficiaries().size());
            assertEquals("Ben", dto.getBeneficiaries().get(0).getBeneficiary().getFirstname());
            assertEquals(LocalDate.of(2026, 5, 26), dto.getBeneficiaries().get(0).getProxyDate());
        }

        @Test
        void givenRepresentativeWithGuarantorAssociations_whenToDto_thenMapsCorrectly() {
            Representative representative = new Representative();
            representative.setId(2L);
            representative.setFirstname("Jane");
            representative.setLastname("Smith");

            Guarantor guarantor = Guarantor.builder()
                    .firstName("Guar")
                    .lastName("Antor")
                    .idCardNumber("GAR123")
                    .issuedAt(LocalDate.of(2020, 1, 1))
                    .build();

            RepresentativeGuarantor association = RepresentativeGuarantor.builder()
                    .guarantor(guarantor)
                    .proxyDate(LocalDate.of(2026, 5, 26))
                    .build();

            representative.setGuarantorAssociations(new ArrayList<>(List.of(association)));
            representative.setBeneficiaryAssociations(new ArrayList<>());
            representative.setCustomerAssociations(new ArrayList<>());

            RepresentativeDto dto = representativeMapper.toDto(representative);

            assertNotNull(dto);
            assertEquals(2L, dto.getId());
            assertNotNull(dto.getGuarantors());
            assertEquals(1, dto.getGuarantors().size());
            assertEquals("Guar", dto.getGuarantors().get(0).getGuarantor().getFirstName());
            assertEquals(LocalDate.of(2026, 5, 26), dto.getGuarantors().get(0).getProxyDate());
        }

        @Test
        void givenRepresentativeWithCustomerAssociation_whenToDto_thenMapsCorrectly() {
            Representative representative = new Representative();
            representative.setId(3L);
            representative.setFirstname("Bob");
            representative.setLastname("Johnson");

            Customer customer = Customer.builder()
                    .firstName("Cust")
                    .lastName("Omer")
                    .code("CUST001")
                    .build();

            RepresentativeCustomer association = RepresentativeCustomer.builder()
                    .customer(customer)
                    .proxyDate(LocalDate.of(2026, 5, 26))
                    .build();

            representative.setCustomerAssociations(new ArrayList<>(List.of(association)));
            representative.setBeneficiaryAssociations(new ArrayList<>());
            representative.setGuarantorAssociations(new ArrayList<>());

            RepresentativeDto dto = representativeMapper.toDto(representative);

            assertNotNull(dto);
            assertEquals(3L, dto.getId());
            assertNotNull(dto.getCustomer());
            assertEquals("Cust", dto.getCustomer().getCustomer().getFirstName());
            assertEquals(LocalDate.of(2026, 5, 26), dto.getCustomer().getProxyDate());
        }

        @Test
        void givenRepresentativeWithAllAssociations_whenToDto_thenMapsAllCorrectly() {
            Representative representative = new Representative();
            representative.setId(4L);
            representative.setFirstname("Alice");
            representative.setLastname("Williams");
            representative.setCin("CIN456");
            representative.setCinIssuedAt(LocalDate.of(2026, 5, 25));

            Beneficiary beneficiary = Beneficiary.builder().firstname("Ben").build();
            Guarantor guarantor = Guarantor.builder().firstName("Guar").build();
            Customer customer = Customer.builder().firstName("Cust").build();

            representative.setBeneficiaryAssociations(new ArrayList<>(List.of(
                    RepresentativeBeneficiary.builder().beneficiary(beneficiary)
                            .proxyDate(LocalDate.of(2026, 5, 26)).build()
            )));
            representative.setGuarantorAssociations(new ArrayList<>(List.of(
                    RepresentativeGuarantor.builder().guarantor(guarantor)
                            .proxyDate(LocalDate.of(2026, 5, 26)).build()
            )));
            representative.setCustomerAssociations(new ArrayList<>(List.of(
                    RepresentativeCustomer.builder().customer(customer)
                            .proxyDate(LocalDate.of(2026, 5, 26)).build()
            )));

            RepresentativeDto dto = representativeMapper.toDto(representative);

            assertNotNull(dto);
            assertEquals(4L, dto.getId());
            assertEquals("Alice", dto.getFirstname());
            assertEquals("Williams", dto.getLastname());
            assertEquals("CIN456", dto.getCin());
            assertEquals(1, dto.getBeneficiaries().size());
            assertEquals(1, dto.getGuarantors().size());
            assertNotNull(dto.getCustomer());
        }

        @Test
        void givenRepresentativeWithoutAssociations_whenToDto_thenMapsBasicFields() {
            Representative representative = new Representative();
            representative.setId(5L);
            representative.setFirstname("Charlie");
            representative.setLastname("Brown");
            representative.setCin("CIN789");
            representative.setBeneficiaryAssociations(new ArrayList<>());
            representative.setGuarantorAssociations(new ArrayList<>());
            representative.setCustomerAssociations(new ArrayList<>());

            RepresentativeDto dto = representativeMapper.toDto(representative);

            assertNotNull(dto);
            assertEquals(5L, dto.getId());
            assertEquals("Charlie", dto.getFirstname());
            assertEquals("Brown", dto.getLastname());
            assertEquals("CIN789", dto.getCin());
            assertNull(dto.getCustomer());
        }

        @Test
        void givenRepresentativeDto_whenToEntity_thenMapsCorrectly() {
            RepresentativeDto dto = RepresentativeDto.builder()
                    .id(6L)
                    .firstname("David")
                    .lastname("Davis")
                    .cin("CIN999")
                    .cinIssuedAt(LocalDate.of(2026, 5, 23))
                    .build();

            Representative entity = representativeMapper.toEntity(dto);

            assertNotNull(entity);
            assertEquals("David", entity.getFirstname());
            assertEquals("Davis", entity.getLastname());
            assertEquals("CIN999", entity.getCin());
            assertEquals(LocalDate.of(2026, 5, 23), entity.getCinIssuedAt());

        }
}
