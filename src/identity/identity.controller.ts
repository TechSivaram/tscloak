import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import { IdentityService } from './identity.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserMapper } from './user.mapper';

@Controller('users')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
  ) {}

  @Post()
  async createUser(
    @Body() dto: CreateUserDto,
  ) {
    const user =
      await this.identityService.createUser(dto);

    return UserMapper.toResponse(user);
  }
}