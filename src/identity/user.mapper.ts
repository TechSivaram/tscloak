import { User } from './entities/user.entity';
import { UserResponseDto } from './dto/user-response.dto';

export class UserMapper {
  static toResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      enabled: user.enabled,
      createdAt: user.createdAt,
    };
  }
}