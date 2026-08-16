package com.npms.core.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "states", schema = "master")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class State {

    @Id
    @Column(name = "code", length = 10)
    private String stateCode;

    @Column(name = "name", length = 100)
    private String stateName;
}
