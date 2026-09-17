import {
  IsArray,
  IsString,
} from 'class-validator';

export class AssignUserRolesDto {
  @IsArray()
  @IsString({ each: true })
  roles: string[];
}
