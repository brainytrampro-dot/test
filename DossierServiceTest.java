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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static java.math.BigDecimal.valueOf;
import static java.util.Collections.singletonList;
import static org.assertj.core.api.AssertionsForClassTypes.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
	private AmortizableLoanRepository amortizableLoanRepository;

	@Autowired
	private AmortizableLoanMapper amortizableLoanMapper;

	@MockitoBean
	private DossierRequestService dossierRequestService;

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

		Guarantor guarantor = Guarantor.builder().firstName("first1").lastName("last1").address("casablanca").idCardNumber("RE9666").issuedAt(LocalDate.now()).build();
		List<Guarantor> gList = new ArrayList<>();
		gList.add(guarantor);

		Beneficiary beneficiary = Beneficiary.builder().firstname("first1").lastname("last1").address("casablanca").idCardNumber("RE9666").issuedAt(LocalDate.now()).build();
		List<Beneficiary> bList = new ArrayList<>();
		bList.add(beneficiary);

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
		Rang rang = new Rang(1L, 12, BigDecimal.valueOf(1000));
		rangs.add(rang);
		Property original = Property.builder()
				.id(1L)
				.landCertificateNumber("OLD-LCN")
				.propertyArea(100.0)
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
		oldDossier.setGuarantors(gList);
		oldDossier.setBeneficiaries(bList);
		oldDossier.setLoanData(loanData);
		oldDossier.setCustomerData(CustomerCard.builder().customer(Customer.builder().prospect(true).build()).build());

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

		dossier.setStatus(status);
		DossierDataDto dossierDto = dossierDataMapper.convertToDTO(dossier);
		dossierDto.setDossierUsers(Collections.singleton(DossierUserDto.builder()
				.user(UserDto.builder().matricule("mat").build())
				.codeRole("INITIATOR")
				.codeProfession("CCP")
				.build()));

		given(dossierDataRepository.findByUuid(any(String.class))).willReturn(dossier);
		when(userService.getUserBy(anyString())).thenReturn(user);
		when(dossierUserRepository.findByIdDossierIdAndIdUserIdAndIdCodeRole(dossier.getId(), user.getId(), "INITIATOR"))
				.thenReturn(Optional.empty());
		when(customerCardRepository.save(any(CustomerCard.class))).thenReturn(CustomerCard.builder().build());

		when(dossierDataRepository.save(any(DossierData.class))).thenReturn(dossier);


		when(dossierCreationContext.resolve(dossierDto)).thenReturn(dossierCreationStrategy);
		when(dossierCreationStrategy.create(dossierDto)).thenReturn(dossierDto);

		DossierDataDto savedDossierData = dossierDataService.update(dossierDto);

		// then - verify the output
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
				.propertyArea(100.0)
				.codePropertyCity("OLD-CITY")
				.forAcquisition(false)
				.rangs(new ArrayList<>(List.of(new Rang(1L, 1, BigDecimal.valueOf(1000)))))
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

		dossier.setStatus(status);
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

		assertNotNull(savedDossierData);
		PropertyDto updateProperty = PropertyDto.builder()
				.id(1L)
				.landCertificateNumber("LCN")
				.propertyArea(100.0)
				.codePropertyCity("CITY")
				.forAcquisition(false)
				.rangs(Arrays.asList(new RangDto(1L, 3, BigDecimal.valueOf(1000))))
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
}
