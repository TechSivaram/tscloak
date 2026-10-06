import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('SCIM Discovery')
@Controller('scim/v2')
export class ScimDiscoveryController {
  @ApiOperation({ summary: 'SCIM service provider capabilities' })
  @Get('ServiceProviderConfig')
  @Header('Content-Type', 'application/scim+json')
  serviceProviderConfig() {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      documentationUri: 'https://www.rfc-editor.org/rfc/rfc7644',
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'OAuth 2.0 Bearer Token',
          description: 'OAuth 2.0 access token issued by TSCloak using the client_credentials grant with the scim scope.',
          specUri: 'https://www.rfc-editor.org/rfc/rfc6750',
          primary: true,
        },
      ],
    };
  }

  @ApiOperation({ summary: 'SCIM supported resource types' })
  @Get('ResourceTypes')
  @Header('Content-Type', 'application/scim+json')
  resourceTypes() {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 1,
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'User',
          name: 'User',
          endpoint: '/scim/v2/Users',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
          meta: { resourceType: 'ResourceType', location: '/scim/v2/ResourceTypes/User' },
        },
      ],
    };
  }

  @ApiOperation({ summary: 'SCIM supported schemas' })
  @Get('Schemas')
  @Header('Content-Type', 'application/scim+json')
  schemas() {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 1,
      Resources: [
        {
          id: 'urn:ietf:params:scim:schemas:core:2.0:User',
          name: 'User',
          description: 'SCIM core User schema supported by TSCloak.',
          attributes: [
            { name: 'userName', type: 'string', multiValued: false, required: true, mutability: 'readWrite', returned: 'default', uniqueness: 'server' },
            { name: 'displayName', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
            { name: 'active', type: 'boolean', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
            {
              name: 'name', type: 'complex', multiValued: false, required: false, mutability: 'readWrite', returned: 'default',
              subAttributes: [
                { name: 'givenName', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
                { name: 'familyName', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
              ],
            },
            {
              name: 'emails', type: 'complex', multiValued: true, required: false, mutability: 'readWrite', returned: 'default',
              subAttributes: [
                { name: 'value', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
                { name: 'primary', type: 'boolean', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
                { name: 'type', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
              ],
            },
          ],
        },
      ],
    };
  }
}
