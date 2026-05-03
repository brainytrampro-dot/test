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

    /**
     * Le bien sur lequel porte ce rang.
     * Doit appartenir aux properties du bénéficiaire — validé au service.
     */
    @ManyToOne
    @JoinColumn(name = "propertyId", referencedColumnName = "id")
    private Property property;

    /**
     * Le bénéficiaire propriétaire de ce rang.
     * Exclusive — 1 Rang = 1 Beneficiary.
     */
    @ManyToOne
    @JoinColumn(name = "beneficiaryId", referencedColumnName = "id")
    private Beneficiary beneficiary;
}
