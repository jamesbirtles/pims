import * as chai from 'chai';

import { Validators } from '..';

describe('Validators', () => {
    let should: Chai.Should;

    before(() => {
        should = chai.should();
    });

    describe('Email', () => {
        const validator = Validators.Email;

        it('returns a validation response', () => {
            const validation = validator('user@example.com');
            validation.should.have.property('valid');
            validation.should.have.property('input');
            validation.should.have.property('error');
        });

        it('accepts valid emails', () => {
            validator('user@example.com').should.have.property('valid').that.is.true;
        });

        it('does not validate null inputs', () => {
            validator(null).should.have.property('valid').that.is.true;
            validator(undefined).should.have.property('valid').that.is.true;
        });

        it('denies invalid emails', () => {
            validator('user#example.com').should.have.property('valid').that.is.false;
            validator('@example.com').should.have.property('valid').that.is.false;
            validator('user@').should.have.property('valid').that.is.false;
        });
    });

    describe('OneOf', () => {
        // tslint:disable-next-line
        const validator = Validators.OneOf('red', 'green', 'blue');

        it('returns a validation response', () => {
            const validation = validator('red');
            validation.should.have.property('valid');
            validation.should.have.property('input');
            validation.should.have.property('error');
        });

        it('accepts each value', () => {
            validator('red').should.have.property('valid').that.is.true;
            validator('green').should.have.property('valid').that.is.true;
            validator('blue').should.have.property('valid').that.is.true;
        });

        it('does not validate null inputs', () => {
            validator(null).should.have.property('valid').that.is.true;
            validator(undefined).should.have.property('valid').that.is.true;
        });

        it('denies other values', () => {
            validator('purple').should.have.property('valid').that.is.false;
            validator('redgreen').should.have.property('valid').that.is.false;
            validator(' blue').should.have.property('valid').that.is.false;
        });
    });

    describe('Required', () => {
        const validator = Validators.Required;

        it('returns a validation response', () => {
            const validation = validator('string');
            validation.should.have.property('valid');
            validation.should.have.property('input');
            validation.should.have.property('error');
        });

        it('accepts any value', () => {
            validator('string').should.have.property('valid').that.is.true;
            validator(true).should.have.property('valid').that.is.true;
            validator(false).should.have.property('valid').that.is.true;
            validator(0).should.have.property('valid').that.is.true;
            validator(100).should.have.property('valid').that.is.true;
        });

        it('denies null or undefined values', () => {
            validator(null).should.have.property('valid').that.is.false;
            validator(undefined).should.have.property('valid').that.is.false;
        });
    });

    describe('Schema', () => {
        // tslint:disable-next-line
        const validator = Validators.Schema({
            firstName: [String, Validators.Required],
            lastName: [String]
        });

        it('returns a validation response', () => {
            const validation = validator({firstName: 'James', lastName: 'Birtles'}, {});
            validation.should.have.property('valid');
            validation.should.have.property('input');
            validation.should.have.property('errors');
        });

        it('allows valid schema values', () => {
            validator({firstName: 'James', lastName: 'Birtles'}, {}).should.have.property('valid').that.is.true;
        });

        it('allows missing keys', () => {
            validator({firstName: 'James'}, {}).should.have.property('valid').that.is.true;
        });

        it('denies values with extraneous keys', () => {
            validator({firstName: 'James', lastName: 'Birtles', middleName: 'Henry'}, {}).should.have.property('valid').that.is.false;
        });

        it('denies values of wrong type', () => {
            validator({firstName: false, lastName: 'Birtles'}, {}).should.have.property('valid').that.is.false;
        });

        it('denies values that do not meet sub validations', () => {
            validator({lastName: 'Birtles'}, {}).should.have.property('valid').that.is.false;
        });
    });
});
