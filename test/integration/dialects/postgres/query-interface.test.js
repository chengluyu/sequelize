'use strict';

const chai = require('chai');
const expect = chai.expect;
const Support = require('../../support');
const dialect = Support.getTestDialect();
const DataTypes = require('../../../../lib/data-types');
const _ = require('lodash');
const Utils = require('../../../../lib/utils');

if (dialect.match(/^postgres/)) {
  describe('[POSTGRES Specific] QueryInterface', () => {
    beforeEach(function() {
      this.sequelize.options.quoteIdenifiers = true;
      this.queryInterface = this.sequelize.getQueryInterface();
    });

    describe('createSchema', () => {
      beforeEach(async function() {
        // make sure we don't have a pre-existing schema called testSchema.
        return Utils.reflectPromise(this.queryInterface.dropSchema('testschema'));
      });

      it('creates a schema', function() {
        return this.queryInterface.createSchema('testschema')
          .then(() => this.sequelize.query(`
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name = 'testschema';
          `, { type: this.sequelize.QueryTypes.SELECT }))
          .then(res => {
            expect(res, 'query results').to.not.be.empty;
            expect(res[0].schema_name).to.be.equal('testschema');
          });
      });

      it('works even when schema exists', function() {
        return this.queryInterface.createSchema('testschema')
          .then(() => this.queryInterface.createSchema('testschema'))
          .then(() => this.sequelize.query(`
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name = 'testschema';
          `, { type: this.sequelize.QueryTypes.SELECT }))
          .then(res => {
            expect(res, 'query results').to.not.be.empty;
            expect(res[0].schema_name).to.be.equal('testschema');
          });
      });
    });

    describe('databaseVersion', () => {
      it('reports version', function() {
        return this.queryInterface.databaseVersion()
          .then(res => {
            // check that result matches expected version number format. example 9.5.4
            expect(res).to.match(/\d\.\d/);
          });
      });
    });

    describe('renameFunction', () => {
      beforeEach(async function() {
        // ensure the function names we'll use don't exist before we start.
        // then setup our function to rename
        await Utils.reflectPromise(this.queryInterface.dropFunction('rftest1', []));
        await Utils.reflectPromise(this.queryInterface.dropFunction('rftest2', []));
        await this.queryInterface.createFunction('rftest1', [], 'varchar', 'plpgsql', 'return \'testreturn\';', {});
      });

      it('renames a function', function() {
        return this.queryInterface.renameFunction('rftest1', [], 'rftest2')
          .then(() => this.sequelize.query('select rftest2();', { type: this.sequelize.QueryTypes.SELECT }))
          .then(res => {
            expect(res[0].rftest2).to.be.eql('testreturn');
          });
      });
    });

    describe('createFunction', () => {

      beforeEach(async function() {
        // make sure we don't have a pre-existing function called create_job
        // this is needed to cover the edge case of afterEach not getting called because of an unexpected issue or stopage with the
        // test suite causing a failure of afterEach's cleanup to be called.
        // suppress errors here. if create_job doesn't exist thats ok.
        await Utils.reflectPromise(this.queryInterface.dropFunction('create_job', [{ type: 'varchar', name: 'test' }]));
      });

      after(async function() {
        // cleanup
        // suppress errors here. if create_job doesn't exist thats ok.
        await Utils.reflectPromise(this.queryInterface.dropFunction('create_job', [{ type: 'varchar', name: 'test' }]));
      });

      it('creates a stored procedure', function() {
        const body = 'return test;';
        const options = {};

        // make our call to create a function
        return this.queryInterface.createFunction('create_job', [{ type: 'varchar', name: 'test' }], 'varchar', 'plpgsql', body, options)
          // validate
          .then(() => this.sequelize.query('select create_job(\'test\');', { type: this.sequelize.QueryTypes.SELECT }))
          .then(res => {
            expect(res[0].create_job).to.be.eql('test');
          });
      });

      it('treats options as optional', function() {
        const body = 'return test;';

        // run with null options parameter
        return this.queryInterface.createFunction('create_job', [{ type: 'varchar', name: 'test' }], 'varchar', 'plpgsql', body, null)
          // validate
          .then(() => this.sequelize.query('select create_job(\'test\');', { type: this.sequelize.QueryTypes.SELECT }))
          .then(res => {
            expect(res[0].create_job).to.be.eql('test');
          });
      });

      it('produces an error when missing expected parameters', function() {
        const body = 'return 1;';
        const options = {};

        return Promise.all([
          // requires functionName
          expect(() => {
            return this.queryInterface.createFunction(null, [{ name: 'test' }], 'integer', 'plpgsql', body, options);
          }).to.throw(/createFunction missing some parameters. Did you pass functionName, returnType, language and body/),

          // requires Parameters array
          expect(() => {
            return this.queryInterface.createFunction('create_job', null, 'integer', 'plpgsql', body, options);
          }).to.throw(/function parameters array required/),

          // requires returnType
          expect(() => {
            return this.queryInterface.createFunction('create_job', [{ type: 'varchar', name: 'test' }], null, 'plpgsql', body, options);
          }).to.throw(/createFunction missing some parameters. Did you pass functionName, returnType, language and body/),

          // requires type in parameter array
          expect(() => {
            return this.queryInterface.createFunction('create_job', [{ name: 'test' }], 'integer', 'plpgsql', body, options);
          }).to.throw(/function or trigger used with a parameter without any type/),

          // requires language
          expect(() => {
            return this.queryInterface.createFunction('create_job', [{ type: 'varchar', name: 'test' }], 'varchar', null, body, options);
          }).to.throw(/createFunction missing some parameters. Did you pass functionName, returnType, language and body/),

          // requires body
          expect(() => {
            return this.queryInterface.createFunction('create_job', [{ type: 'varchar', name: 'test' }], 'varchar', 'plpgsql', null, options);
          }).to.throw(/createFunction missing some parameters. Did you pass functionName, returnType, language and body/)
        ]);
      });

      it('overrides a function', function() {
        const first_body = 'return \'first\';';
        const second_body = 'return \'second\';';

        // create function
        return this.queryInterface.createFunction('my_func', [], 'varchar', 'plpgsql', first_body, null)
          // override
          .then(() => this.queryInterface.createFunction('my_func', [], 'varchar', 'plpgsql', second_body, null, { force: true }))
          // validate
          .then(() => this.sequelize.query('select my_func();', { type: this.sequelize.QueryTypes.SELECT }))
          .then(res => {
            expect(res[0].my_func).to.be.eql('second');
          });
      });
    });

    describe('dropFunction', () => {
      beforeEach(async function() {
        const body = 'return test;';
        const options = {};

        // make sure we have a droptest function in place.
        // suppress errors.. this could fail if the function is already there.. thats ok.
        await Utils.reflectPromise(this.queryInterface.createFunction('droptest', [{ type: 'varchar', name: 'test' }], 'varchar', 'plpgsql', body, options));
      });

      it('can drop a function', function() {
        return expect(
          // call drop function
          this.queryInterface.dropFunction('droptest', [{ type: 'varchar', name: 'test' }])
            // now call the function we attempted to drop.. if dropFunction worked as expect it should produce an error.
            .then(() => {
              // call the function we attempted to drop.. if it is still there then throw an error informing that the expected behavior is not met.
              return this.sequelize.query('select droptest(\'test\');', { type: this.sequelize.QueryTypes.SELECT });
            })
        // test that we did get the expected error indicating that droptest was properly removed.
        ).to.be.rejectedWith(/.*function droptest.* does not exist/);
      });

      it('produces an error when missing expected parameters', function() {
        return Promise.all([
          expect(() => {
            return this.queryInterface.dropFunction();
          }).to.throw(/.*requires functionName/),

          expect(() => {
            return this.queryInterface.dropFunction('droptest');
          }).to.throw(/.*function parameters array required/),

          expect(() => {
            return this.queryInterface.dropFunction('droptest', [{ name: 'test' }]);
          }).to.be.throw(/.*function or trigger used with a parameter without any type/)
        ]);
      });
    });

    describe('indexes', () => {
      beforeEach(function() {
        return this.queryInterface.dropTable('Group')
          .then(() => this.queryInterface.createTable('Group', {
            username: DataTypes.STRING,
            isAdmin: DataTypes.BOOLEAN,
            from: DataTypes.STRING
          }));
      });

      it('supports newlines', function() {
        return this.queryInterface.addIndex('Group', [this.sequelize.literal(`(
            CASE "username"
              WHEN 'foo' THEN 'bar'
              ELSE 'baz'
            END
          )`)], { name: 'group_username_case' })
          .then(() => this.queryInterface.showIndex('Group'))
          .then(indexes => {
            const indexColumns = _.uniq(indexes.map(index => index.name));

            expect(indexColumns).to.include('group_username_case');
          });
      });

      it('adds, reads and removes a named functional index to the table', function() {
        return this.queryInterface.addIndex('Group', [this.sequelize.fn('lower', this.sequelize.col('username'))], {
          name: 'group_username_lower'
        })
          .then(() => this.queryInterface.showIndex('Group'))
          .then(indexes => {
            const indexColumns = _.uniq(indexes.map(index => index.name));

            expect(indexColumns).to.include('group_username_lower');
          })
          .then(() => this.queryInterface.removeIndex('Group', 'group_username_lower'))
          .then(() => this.queryInterface.showIndex('Group'))
          .then(indexes => {
            const indexColumns = _.uniq(indexes.map(index => index.name));
            expect(indexColumns).to.be.empty;
          });
      });
    });
  });
}
