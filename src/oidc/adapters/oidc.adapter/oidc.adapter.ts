import { OidcRepository } from '../../repositories/oidc.repository';

export class OidcAdapter {
    constructor(
        private readonly model: string,
        private readonly repository: OidcRepository,
    ) { }

    async upsert(
        id: string,
        payload: Record<string, unknown>,
        expiresIn: number,
    ): Promise<void> {
        const expiresAt =
            typeof expiresIn === 'number'
                ? new Date(
                    Date.now() + expiresIn * 1000,
                )
                : null;

        await this.repository.save({
            id,
            model: this.model,
            payload,
            expiresAt,

            grantId:
                typeof payload.grantId === 'string'
                    ? payload.grantId
                    : null,

            uid:
                typeof payload.uid === 'string'
                    ? payload.uid
                    : null,

            userCode:
                typeof payload.userCode === 'string'
                    ? payload.userCode
                    : null,
        });
    }

    async find(
        id: string,
    ): Promise<Record<string, unknown> | undefined> {
        const oidc =
            await this.repository.find(
                this.model,
                id,
            );

        if (!oidc) {
            return undefined;
        }

        if (
            oidc.expiresAt &&
            oidc.expiresAt.getTime() <= Date.now()
        ) {
            await this.repository.delete(
                this.model,
                id,
            );

            return undefined;
        }

        return oidc.payload;
    }

    async destroy(
        id: string,
    ): Promise<void> {
        await this.repository.delete(
            this.model,
            id,
        );
    }

    async consume(
        id: string,
    ): Promise<void> {
        const oidc =
            await this.repository.find(
                this.model,
                id,
            );

        if (!oidc) {
            return;
        }

        oidc.payload = {
            ...oidc.payload,
            consumed: Math.floor(Date.now() / 1000),
        };

        await this.repository.save(oidc);
    }

    async findByUid(
        uid: string,
    ): Promise<Record<string, unknown> | undefined> {
        const oidc =
            await this.repository.findByUid(
                this.model,
                uid,
            );

        if (!oidc) {
            return undefined;
        }

        return oidc.payload;
    }

    async findByUserCode(
        userCode: string,
    ): Promise<Record<string, unknown> | undefined> {
        const oidc =
            await this.repository.findByUserCode(
                this.model,
                userCode,
            );

        if (!oidc) {
            return undefined;
        }

        return oidc.payload;
    }

    async revokeByGrantId(
        grantId: string,
    ): Promise<void> {
        const records =
            await this.repository.findByGrantId(
                grantId,
            );

        for (const record of records) {
            await this.repository.delete(
                record.model,
                record.id,
            );
        }
    }
}