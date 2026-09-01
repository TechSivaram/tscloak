import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UpdateSecurityPolicyDto } from '../../dto/update-security-policy.dto';
import { SecurityPolicy } from '../../entities/security-policy.entity';

@Injectable()
export class SecurityPolicyService {
    private readonly defaultPolicy: Partial<SecurityPolicy> = {
        // =========================
        // Token Policy
        // =========================

        accessTokenTtl: 15 * 60, // 15 minutes
        idTokenTtl: 15 * 60, // 15 minutes
        authorizationCodeTtl: 5 * 60, // 5 minutes
        refreshTokenTtl: 30 * 24 * 60 * 60, // 30 days

        // =========================
        // Refresh Token Policy
        // =========================

        refreshTokenRotationEnabled: true,
        refreshTokenReuseDetectionEnabled: true,

        // =========================
        // Session Policy
        // =========================

        sessionTtl: 7 * 24 * 60 * 60, // 7 days
        interactionTtl: 10 * 60, // 10 minutes
    };

    constructor(
        @InjectRepository(SecurityPolicy)
        private readonly securityPolicyRepository: Repository<SecurityPolicy>,
    ) { }

    /**
     * Gets the server-level security policy.
     *
     * Creates the default policy automatically if one
     * does not already exist.
     */
    async getPolicy(): Promise<SecurityPolicy> {
        let policy = await this.securityPolicyRepository.findOne({
            where: {},
        });

        if (!policy) {
            policy = this.securityPolicyRepository.create(
                this.defaultPolicy,
            );

            policy = await this.securityPolicyRepository.save(policy);
        }

        return policy;
    }

    /**
     * Updates the server-level security policy.
     */
    async updatePolicy(
        updateSecurityPolicyDto: UpdateSecurityPolicyDto,
    ): Promise<SecurityPolicy> {
        const policy = await this.getPolicy();

        Object.assign(
            policy,
            updateSecurityPolicyDto,
        );

        return this.securityPolicyRepository.save(policy);
    }
}