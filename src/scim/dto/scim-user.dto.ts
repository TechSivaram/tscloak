import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ScimNameDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  givenName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  familyName?: string;
}

export class ScimEmailDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsString()
  value!: string;

  @ApiPropertyOptional({ example: 'work' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  primary?: boolean;
}

export class ScimUserDto {
  @ApiProperty({ example: 'john.doe' })
  @IsString()
  userName!: string;

  @ApiPropertyOptional({ type: ScimNameDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScimNameDto)
  name?: ScimNameDto;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ type: [ScimEmailDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScimEmailDto)
  emails?: ScimEmailDto[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
