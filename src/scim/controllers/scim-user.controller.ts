import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ScimAuthGuard, type ScimRequest } from '../guards/scim-auth.guard';
import type {
  ScimUserInput,
  ScimUserPatchOperation,
} from '../services/scim-user.service';
import { ScimUserService } from '../services/scim-user.service';

const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';

@ApiTags('SCIM Users')
@ApiBearerAuth('access-token')
@ApiConsumes('application/scim+json')
@ApiProduces('application/scim+json')
@Controller('scim/v2/Users')
@UseGuards(ScimAuthGuard)
export class ScimUserController {
  constructor(private readonly users: ScimUserService) {}

  @Get()
  @Header('Content-Type', 'application/scim+json')
  @ApiOperation({ summary: 'List SCIM users for the authenticated client' })
  async list(
    @Req() request: ScimRequest,
    @Query() query: Record<string, string>,
  ) {
    const all = await this.users.list(request.scim!.clientId);
    const filtered = this.applyFilter(all, query.filter);
    const startIndex = Math.max(
      Number.parseInt(query.startIndex ?? '1', 10) || 1,
      1,
    );
    const count = Math.min(
      Math.max(Number.parseInt(query.count ?? '100', 10) || 100, 0),
      200,
    );
    const start = startIndex - 1;
    const resources = filtered
      .slice(start, start + count)
      .map((user) => this.toScim(user, request));
    return {
      schemas: [LIST_SCHEMA],
      totalResults: filtered.length,
      startIndex,
      itemsPerPage: resources.length,
      Resources: resources,
    };
  }

  @Post()
  @Header('Content-Type', 'application/scim+json')
  @ApiOperation({
    summary: 'Create a SCIM user under the authenticated client',
  })
  async create(
    @Req() request: ScimRequest,
    @Body() body: ScimUserInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.users.create(request.scim!.clientId, body);
    response.status(201);
    return this.toScim(user, request);
  }

  @Get(':id')
  @Header('Content-Type', 'application/scim+json')
  get(@Req() request: ScimRequest, @Param('id') id: string) {
    return this.users
      .get(id, request.scim!.clientId)
      .then((user) => this.toScim(user, request));
  }

  @Put(':id')
  @Header('Content-Type', 'application/scim+json')
  update(
    @Req() request: ScimRequest,
    @Param('id') id: string,
    @Body() body: ScimUserInput,
  ) {
    return this.users
      .update(id, request.scim!.clientId, body)
      .then((user) => this.toScim(user, request));
  }

  @Patch(':id')
  @Header('Content-Type', 'application/scim+json')
  patch(
    @Req() request: ScimRequest,
    @Param('id') id: string,
    @Body() body: { schemas?: string[]; Operations?: ScimUserPatchOperation[] },
  ) {
    return this.users
      .patch(id, request.scim!.clientId, body.Operations ?? [])
      .then((user) => this.toScim(user, request));
  }

  @Delete(':id')
  async remove(
    @Req() request: ScimRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    await this.users.remove(id, request.scim!.clientId);
    response.status(204).send();
  }

  private toScim(user: any, request: ScimRequest) {
    const base = `${request.protocol}://${request.get('host')}/scim/v2/Users/${user.id}`;
    const resource: any = {
      schemas: [USER_SCHEMA],
      id: user.id,
      userName: user.username,
      active: user.enabled,
      displayName: user.displayName ?? undefined,
      name: {
        givenName: user.givenName ?? undefined,
        familyName: user.familyName ?? undefined,
      },
      emails: user.email
        ? [{ value: user.email, type: 'work', primary: true }]
        : [],
      meta: {
        resourceType: 'User',
        created: user.createdAt?.toISOString?.(),
        lastModified: user.updatedAt?.toISOString?.(),
        location: base,
      },
    };
    return resource;
  }

  private applyFilter(users: any[], filter?: string) {
    if (!filter) return users;
    const match = filter.match(
      /^\s*(userName|emails\.value)\s+(eq|co|sw)\s+"([^"]*)"\s*$/i,
    );
    if (!match) throw new BadRequestException('Unsupported SCIM filter');
    const [, attribute, operator, rawValue] = match;
    const value = rawValue.toLowerCase();
    return users.filter((user) => {
      const candidate =
        attribute.toLowerCase() === 'username' ? user.username : user.email;
      if (!candidate) return false;
      const actual = candidate.toLowerCase();
      if (operator.toLowerCase() === 'eq') return actual === value;
      if (operator.toLowerCase() === 'co') return actual.includes(value);
      return actual.startsWith(value);
    });
  }
}
