import { ComputedField, Field, Model, Validators } from '..';

export class User extends Model {
    @Field()
    public id: string;

    @Field()
    public name: string;

    @Field(Validators.Required, Validators.Email)
    public email: string;

    @Field()
    public age: number;

    @ComputedField((user: User) => user.age + 20)
    public agePlus20: number;
}
