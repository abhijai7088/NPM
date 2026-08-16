package com.npms.master.entity;
import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

@Entity
@Table(name = "ministries", schema = "master")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Ministry {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(nullable = false, unique = true)
    private String code;
    @Column(nullable = false)
    private String name;
    @Column(name = "is_active")
    @Builder.Default
    private boolean isActive = true;
}