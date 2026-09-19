import {
  Controller,
  Get,
  NotFoundException,
  Query,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ClientsService } from 'src/clients/clients.service';


@Controller('admin/config')
@ApiTags('Portal Configuration')
export class AdminClientConfigController {

  constructor(
    private readonly clientsService: ClientsService,
  ) { }


  @Get('oidc')
  @ApiOperation({
    summary: 'Resolve portal OIDC client configuration',
  })
  @ApiQuery({
    name: 'portal',
    enum: ['admin', 'client-admin'],
    required: false,
  })
  @ApiQuery({
    name: 'clientId',
    required: false,
    description:
      'Resolve this specific client instead of searching by callback URL.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Public OIDC client configuration returned.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Unknown portal or no enabled client.',
  })
  async getOidcClient(
    @Query('portal') portal: string = 'admin',
    @Query('clientId') clientId?: string,
  ): Promise<{
    clientId: string;
    redirectUri: string;
    postLogoutRedirectUri?: string;
  }> {

    const callbackPath =
      portal === 'idp-client-admin'
        ? '/idp-client-admin/callback.html'
        : portal === 'idp-admin'
          ? '/idp-admin/callback.html'
          : null;


    /*
     * A clientId resolves the client directly, so an unrecognized
     * portal value no longer needs to block the request.
     */
    const client =
      clientId
        ? await this.clientsService.findByClientId(clientId)
        : callbackPath
          ? await this.clientsService.findClientForCallback(callbackPath,)
          : null;


    if (!client || !client.enabled) {

      throw new NotFoundException(
        'No enabled client is registered for this redirect URI or clientId',
      );
    }


    /*
     * client-admin is multi-tenant
     * (/idp-client-admin/{clientId}/), so a client can have
     * multiple post-logout redirect URIs registered -
     * one per tenant path.
     *
     * Match on the specific tenant path instead of the
     * bare portal path to avoid picking the wrong one.
     */
    const postLogoutPath =
      portal === 'idp-client-admin'
        ? `/idp-client-admin/${client.clientId}/`
        : '/idp-admin/';


    return {

      clientId:
        client.clientId,

      redirectUri:
        this.resolveRedirectUri(
          client.redirectUris,
          callbackPath,
        ),

      postLogoutRedirectUri:
        this.resolvePostLogoutRedirectUri(
          client.postLogoutRedirectUris ?? [],
          postLogoutPath,
        ),
    };
  }


  /*
   * A client may have several redirect URIs registered
   * (multiple tenants/environments).
   *
   * Search the whole list for one matching the expected
   * callback path instead of assuming index [0].
   */
  private resolveRedirectUri(
    redirectUris: string[],
    callbackPath: string | null,
  ): string {

    if (callbackPath) {

      const match =
        redirectUris.find(uri => {

          try {

            return (
              new URL(uri).pathname ===
              callbackPath
            );

          } catch {

            return false;
          }
        });


      if (match) {
        return match;
      }
    }


    return (
      redirectUris.find(uri => {

        try {

          return new URL(uri)
            .pathname
            .endsWith('callback.html');

        } catch {

          return false;
        }
      })
      ?? redirectUris[0]
      ?? ''
    );
  }


  /*
   * Same idea as resolveRedirectUri:
   *
   * A client may register several post-logout URIs
   * (one per tenant), so search the whole list.
   *
   * Exact match first, then tenant-path prefix.
   * Do not assume the array only has one useful entry.
   */
  private resolvePostLogoutRedirectUri(
    postLogoutRedirectUris: string[],
    postLogoutPath: string,
  ): string | undefined {

    const exact =
      postLogoutRedirectUris.find(uri => {

        try {

          return (
            new URL(uri).pathname.replace(/\/+$/, '').toLowerCase().includes(
              postLogoutPath.replace(/\/+$/, '').toLowerCase()
            )
          );

        } catch {

          return false;
        }
      });


    if (exact) {
      return exact;
    }


    return (
      postLogoutRedirectUris.find(uri => {

        try {

          return new URL(uri)
            .pathname
            .startsWith(postLogoutPath);

        } catch {

          return false;
        }
      })
      ?? postLogoutRedirectUris[0]
    );
  }
}